import { afterEach, describe, expect, it } from 'vitest';
import type { Principal } from '@ja/domain';
import { V3AccessDeniedError, V3ConflictError, V3ValidationError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: Array<B5LifecycleSecurityFixture> = [];

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

type Fixture = B5LifecycleSecurityFixture & { legacyLegalEntityId: string };

function fixture(): Fixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  const legacy = value.repository.createLegalEntity(value.owner, {
    code: 'WP03-LEGACY',
    legalName: 'J&A Legacy Legal Entity',
    currency: 'EUR',
    billingAddress: 'Legacy address retained for explicit migration input',
    companyIdentifiers: 'LEGACY-TAX-001',
  });
  return { ...value, legacyLegalEntityId: legacy.id };
}

function steppedUp(value: Fixture, principal: Principal, label: string): Principal {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  const sessionId = `wp03-canonical-${principal.userId}-${label}`;
  value.sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(sessionId, `${sessionId}-token`, principal.userId, expiresAt, now, now, now);
  return { ...principal, sessionId };
}

/**
 * Keep this contract RED while Sol introduces the canonical legal-entity
 * service.  A missing command produces a focused failure instead of making
 * the test file itself untypeable.
 */
function command<TResult>(target: object, name: string, ...args: readonly unknown[]): TResult {
  const candidate = (target as Record<string, unknown>)[name];
  if (typeof candidate !== 'function')
    throw new Error(`Client Essential command is not implemented: ${name}`);
  return (candidate as (...values: readonly unknown[]) => TResult).apply(target, args);
}

type CanonicalLegalEntityInput = Readonly<{
  legacyLegalEntityId: string;
  effectiveFrom: string;
  legalName: string;
  taxIdentifier: string;
  registrationIdentifier?: string;
  addressLine1: string;
  addressLine2?: string;
  locality: string;
  region?: string;
  postalCode: string;
  countryCode: string;
  baseCurrency: 'EUR' | 'USD';
  timezone: string;
  reason: string;
  idempotencyKey: string;
}>;

type ProjectLegalEntityAssignmentInput = Readonly<{
  projectId: string;
  legalEntityRevisionId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  reason: string;
  idempotencyKey: string;
}>;

function canonicalInput(
  value: Fixture,
  overrides: Partial<CanonicalLegalEntityInput> = {},
): CanonicalLegalEntityInput {
  return {
    legacyLegalEntityId: value.legacyLegalEntityId,
    effectiveFrom: '2026-01-01',
    legalName: 'J&A Automation Europe S.L.',
    taxIdentifier: 'ESB12345678',
    registrationIdentifier: 'REG-MAD-001',
    addressLine1: 'Calle de la Industria 42',
    addressLine2: 'Planta 3',
    locality: 'Madrid',
    region: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR',
    timezone: 'Europe/Madrid',
    reason: 'Register the complete Client Essential legal-entity authority',
    idempotencyKey: 'wp03:canonical-legal-entity:genesis',
    ...overrides,
  };
}

function createRevision(
  value: Fixture,
  principal: Principal,
  overrides: Partial<CanonicalLegalEntityInput> = {},
): Record<string, unknown> {
  return command<Record<string, unknown>>(
    value.v3,
    'createCanonicalLegalEntityRevision',
    principal,
    canonicalInput(value, overrides),
  );
}

function assignRevision(
  value: Fixture,
  principal: Principal,
  input: ProjectLegalEntityAssignmentInput,
): Record<string, unknown> {
  return command<Record<string, unknown>>(
    value.v3,
    'assignCanonicalLegalEntityToProject',
    principal,
    input,
  );
}

function revisionId(result: Record<string, unknown>): string {
  const id = result.revisionId;
  if (typeof id !== 'string' || !id)
    throw new Error('Canonical revision result omitted revisionId');
  return id;
}

function assignmentId(result: Record<string, unknown>): string {
  const id = result.assignmentId;
  if (typeof id !== 'string' || !id)
    throw new Error('Canonical assignment result omitted assignmentId');
  return id;
}

describe('Client Essential canonical project legal-entity authority', () => {
  it('projects only safe bridged revision choices and assignment history to Owner/Finance', () => {
    const value = fixture();
    const finance = steppedUp(value, value.finance, 'safe-projection');
    const canonical = createRevision(value, finance);
    const canonicalId = revisionId(canonical);

    const options = command<Array<Record<string, unknown>>>(
      value.v3,
      'listCanonicalLegalEntityRevisionOptions',
      finance,
    );
    expect(options).toEqual([
      expect.objectContaining({
        revisionId: canonicalId,
        legalEntityId: value.legacyLegalEntityId,
        legalName: 'J&A Automation Europe S.L.',
        legalEntityCode: 'WP03-LEGACY',
        baseCurrency: 'EUR',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
      }),
    ]);
    expect(options[0]).not.toHaveProperty('taxIdentifier');
    expect(options[0]).not.toHaveProperty('registrationIdentifier');
    expect(options[0]).not.toHaveProperty('addressLine1');

    assignRevision(value, finance, {
      projectId: value.project.id,
      legalEntityRevisionId: canonicalId,
      effectiveFrom: '2026-02-01',
      reason: 'Bind project to the reviewed issuing authority',
      idempotencyKey: 'wp03:safe-projection:assignment',
    });
    expect(
      command<Array<Record<string, unknown>>>(
        value.v3,
        'listProjectLegalEntityAssignments',
        finance,
        value.project.id,
      ),
    ).toEqual([
      expect.objectContaining({
        projectId: value.project.id,
        legalName: 'J&A Automation Europe S.L.',
        legalEntityCode: 'WP03-LEGACY',
        baseCurrency: 'EUR',
        effectiveFrom: '2026-02-01',
        effectiveTo: null,
      }),
    ]);

    for (const principal of [value.worker, value.manager]) {
      expect(() => command(value.v3, 'listCanonicalLegalEntityRevisionOptions', principal)).toThrow(
        V3AccessDeniedError,
      );
      expect(() =>
        command(value.v3, 'listProjectLegalEntityAssignments', principal, value.project.id),
      ).toThrow(V3AccessDeniedError);
    }
  });

  it('requires complete explicit legal-entity data and a recent step-up for Owner/Finance writes', () => {
    const value = fixture();
    if (
      typeof (value.v3 as Record<string, unknown>).createCanonicalLegalEntityRevision !== 'function'
    ) {
      expect(() => createRevision(value, value.owner)).toThrow(
        'Client Essential command is not implemented: createCanonicalLegalEntityRevision',
      );
      return;
    }
    const invalidCases: Array<Partial<CanonicalLegalEntityInput>> = [
      { legalName: '' },
      { taxIdentifier: '' },
      { addressLine1: '   ' },
      { locality: '' },
      { postalCode: '' },
      { countryCode: '' },
      { baseCurrency: '' as 'EUR' },
      { timezone: '' },
      { reason: '' },
      { idempotencyKey: '' },
    ];

    expect(() => createRevision(value, value.owner)).toThrow(V3AccessDeniedError);
    expect(() => createRevision(value, value.finance)).toThrow(V3AccessDeniedError);
    expect(() => createRevision(value, value.manager)).toThrow(V3AccessDeniedError);
    expect(() => createRevision(value, value.worker)).toThrow(V3AccessDeniedError);

    const owner = steppedUp(value, value.owner, 'owner');
    for (const [index, invalid] of invalidCases.entries()) {
      expect(() =>
        createRevision(value, owner, {
          ...invalid,
          idempotencyKey:
            invalid.idempotencyKey === undefined ? `wp03:invalid:${index}` : invalid.idempotencyKey,
        }),
      ).toThrow(V3ValidationError);
    }
    expect(
      value.sqlite.prepare('SELECT COUNT(*) AS count FROM legal_entity_revision').get(),
    ).toEqual({
      count: 0,
    });
  });

  it('creates an immutable canonical revision with exact fields, hash, finance command and evidence', () => {
    const value = fixture();
    const finance = steppedUp(value, value.finance, 'finance');
    const result = createRevision(value, finance);
    const id = revisionId(result);

    expect(result).toMatchObject({ revisionId: id, idempotent: false });
    const row = value.sqlite
      .prepare(
        `SELECT revision_id,series_id,revision_number,predecessor_revision_id,
                tenant_id,deployment_id,legal_name,tax_identifier,registration_identifier,
                address_line1,address_line2,locality,region,postal_code,country_code,
                base_currency,timezone,effective_from,effective_to,revision_hash,created_by,command_id
           FROM legal_entity_revision WHERE revision_id=?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    expect(row).toMatchObject({
      revision_id: id,
      revision_number: 1,
      predecessor_revision_id: null,
      legal_name: 'J&A Automation Europe S.L.',
      tax_identifier: 'ESB12345678',
      registration_identifier: 'REG-MAD-001',
      address_line1: 'Calle de la Industria 42',
      address_line2: 'Planta 3',
      locality: 'Madrid',
      region: 'Madrid',
      postal_code: '28001',
      country_code: 'ES',
      base_currency: 'EUR',
      timezone: 'Europe/Madrid',
      effective_from: '2026-01-01',
      effective_to: null,
      created_by: finance.userId,
    });
    expect(String(row?.revision_hash)).toMatch(/^[0-9a-f]{64}$/u);
    expect(String(row?.command_id)).not.toBe('');

    const commandRow = value.sqlite
      .prepare(
        `SELECT c.operation,c.idempotency_key,c.principal_id,c.step_up_verified_at,c.state,
                e.evidence_hash,e.canonical_blob
           FROM finance_command c
           JOIN finance_hash_evidence e ON e.evidence_type='legal_entity_revision'
            AND e.evidence_hash=?
          WHERE c.command_id=?`,
      )
      .get(row?.revision_hash, row?.command_id) as
      | {
          operation: string;
          idempotency_key: string;
          principal_id: string;
          step_up_verified_at: string | null;
          state: string;
          evidence_hash: string;
          canonical_blob: Uint8Array;
        }
      | undefined;
    expect(commandRow).toMatchObject({
      operation: 'legal_entity_revision.create',
      idempotency_key: 'wp03:canonical-legal-entity:genesis',
      principal_id: finance.userId,
      state: 'completed',
      evidence_hash: row?.revision_hash,
    });
    expect(commandRow?.step_up_verified_at).not.toBeNull();
    expect(Buffer.from(commandRow?.canonical_blob ?? new Uint8Array()).toString('utf8')).toContain(
      'J&A Automation Europe S.L.',
    );

    expect(
      value.sqlite
        .prepare(
          `SELECT COUNT(*) AS count FROM finance_change_event
             WHERE entity_kind='legal_entity_revision' AND entity_id=? AND command_id=?`,
        )
        .get(id, row?.command_id),
    ).toEqual({ count: 1 });
    expect(() =>
      value.sqlite
        .prepare('UPDATE legal_entity_revision SET legal_name=? WHERE revision_id=?')
        .run('Mutated history', id),
    ).toThrow(/finance revision immutable/i);
    expect(() =>
      value.sqlite.prepare('DELETE FROM legal_entity_revision WHERE revision_id=?').run(id),
    ).toThrow(/finance revision immutable/i);
  });

  it('appends effective-dated revisions and accepts only exact idempotent replays', () => {
    const value = fixture();
    const owner = steppedUp(value, value.owner, 'owner');
    const first = createRevision(value, owner);
    const firstId = revisionId(first);
    const second = createRevision(value, owner, {
      effectiveFrom: '2026-07-01',
      legalName: 'J&A Automation Europe S.L. 2026',
      idempotencyKey: 'wp03:canonical-legal-entity:v2',
    });
    const secondId = revisionId(second);
    expect(secondId).not.toBe(firstId);
    expect(
      value.sqlite
        .prepare(
          'SELECT revision_number,predecessor_revision_id,effective_from FROM legal_entity_revision WHERE revision_id=?',
        )
        .get(secondId),
    ).toEqual({
      revision_number: 2,
      predecessor_revision_id: firstId,
      effective_from: '2026-07-01',
    });

    const replay = createRevision(value, owner, {
      effectiveFrom: '2026-07-01',
      legalName: 'J&A Automation Europe S.L. 2026',
      idempotencyKey: 'wp03:canonical-legal-entity:v2',
    });
    expect(replay).toMatchObject({ revisionId: secondId, idempotent: true });
    const series = value.sqlite
      .prepare('SELECT series_id FROM legal_entity_revision WHERE revision_id=?')
      .get(firstId) as { series_id: string };
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) AS count FROM legal_entity_revision WHERE series_id=?')
        .get(series.series_id),
    ).toEqual({ count: 2 });

    expect(() =>
      createRevision(value, owner, {
        effectiveFrom: '2026-07-01',
        legalName: 'Changed replay must conflict',
        idempotencyKey: 'wp03:canonical-legal-entity:v2',
      }),
    ).toThrow(V3ConflictError);
  });

  it('assigns canonical revisions to projects without overlap and resolves exactly one revision by date', () => {
    const value = fixture();
    const finance = steppedUp(value, value.finance, 'finance');
    const firstId = revisionId(createRevision(value, finance));
    const secondId = revisionId(
      createRevision(value, finance, {
        effectiveFrom: '2026-07-01',
        legalName: 'J&A Automation Europe S.L. 2026',
        idempotencyKey: 'wp03:canonical-legal-entity:v2',
      }),
    );

    const firstAssignment = assignRevision(value, finance, {
      projectId: value.project.id,
      legalEntityRevisionId: firstId,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-06-30',
      reason: 'Initial project legal-entity authority',
      idempotencyKey: 'wp03:project-legal-entity:1',
    });
    const secondAssignment = assignRevision(value, finance, {
      projectId: value.project.id,
      legalEntityRevisionId: secondId,
      effectiveFrom: '2026-07-01',
      reason: 'Project legal-entity authority revision',
      idempotencyKey: 'wp03:project-legal-entity:2',
    });
    expect(assignmentId(firstAssignment)).not.toBe(assignmentId(secondAssignment));
    expect(
      value.sqlite
        .prepare(
          'SELECT legal_entity_revision_id,effective_from,effective_to FROM project_legal_entity_assignment WHERE project_id=? ORDER BY effective_from',
        )
        .all(value.project.id),
    ).toEqual([
      {
        legal_entity_revision_id: firstId,
        effective_from: '2026-01-01',
        effective_to: '2026-06-30',
      },
      { legal_entity_revision_id: secondId, effective_from: '2026-07-01', effective_to: null },
    ]);

    expect(
      command<Record<string, unknown>>(
        value.v3,
        'resolveCanonicalProjectLegalEntity',
        finance,
        value.project.id,
        '2026-03-01',
      ),
    ).toMatchObject({ revisionId: firstId, effectiveFrom: '2026-01-01' });
    expect(
      command<Record<string, unknown>>(
        value.v3,
        'resolveCanonicalProjectLegalEntity',
        finance,
        value.project.id,
        '2026-08-01',
      ),
    ).toMatchObject({ revisionId: secondId, effectiveFrom: '2026-07-01' });
    expect(
      command<Record<string, unknown>>(
        value.v3,
        'resolveCanonicalProjectLegalEntity',
        finance,
        value.project.id,
        '2026-06-30',
      ),
    ).toMatchObject({ revisionId: firstId, effectiveFrom: '2026-01-01' });
    expect(
      command<Record<string, unknown>>(
        value.v3,
        'resolveCanonicalProjectLegalEntity',
        finance,
        value.project.id,
        '2026-07-01',
      ),
    ).toMatchObject({ revisionId: secondId, effectiveFrom: '2026-07-01' });

    expect(() =>
      assignRevision(value, finance, {
        projectId: value.project.id,
        legalEntityRevisionId: secondId,
        effectiveFrom: '2026-06-15',
        effectiveTo: '2026-07-15',
        reason: 'Overlapping project authority must fail',
        idempotencyKey: 'wp03:project-legal-entity:overlap',
      }),
    ).toThrow(V3ConflictError);

    expect(() =>
      command(
        value.v3,
        'resolveCanonicalProjectLegalEntity',
        value.manager,
        value.project.id,
        '2026-03-01',
      ),
    ).toThrow(V3AccessDeniedError);
    expect(() =>
      command(
        value.v3,
        'resolveCanonicalProjectLegalEntity',
        value.worker,
        value.project.id,
        '2026-03-01',
      ),
    ).toThrow(V3AccessDeniedError);
    expect(() =>
      assignRevision(value, value.manager, {
        projectId: value.project.id,
        legalEntityRevisionId: secondId,
        effectiveFrom: '2027-01-01',
        reason: 'PM cannot configure commercial authority',
        idempotencyKey: 'wp03:project-legal-entity:pm',
      }),
    ).toThrow(V3AccessDeniedError);
  });

  it('fails closed for a project with no canonical assignment and for an ambiguous interval', () => {
    const value = fixture();
    const finance = steppedUp(value, value.finance, 'finance');
    const revisionIdValue = revisionId(createRevision(value, finance));
    const unconfiguredProject = value.repository.createProject(value.owner, {
      clientId: value.client.id,
      name: 'No canonical legal entity project',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });

    expect(() =>
      command(
        value.v3,
        'resolveCanonicalProjectLegalEntity',
        finance,
        unconfiguredProject.id,
        '2026-03-01',
      ),
    ).toThrow(V3ConflictError);

    const assignment = assignRevision(value, finance, {
      projectId: value.project.id,
      legalEntityRevisionId: revisionIdValue,
      effectiveFrom: '2026-01-01',
      reason: 'Seed canonical assignment before ambiguity fixture',
      idempotencyKey: 'wp03:project-legal-entity:ambiguity-base',
    });
    const assignmentIdValue = assignmentId(assignment);
    expect(() =>
      value.sqlite
        .prepare(
          `INSERT INTO project_legal_entity_assignment(
             assignment_id,project_id,legal_entity_revision_id,tenant_id,deployment_id,
             effective_from,effective_to,created_at,command_id
           )
           SELECT ?,project_id,legal_entity_revision_id,tenant_id,deployment_id,
                  effective_from,effective_to,created_at,command_id
             FROM project_legal_entity_assignment WHERE assignment_id=?`,
        )
        .run('wp03-ambiguous-assignment', assignmentIdValue),
    ).toThrow(/overlap|ambiguous|interval|assignment/i);

    expect(
      command(
        value.v3,
        'resolveCanonicalProjectLegalEntity',
        finance,
        value.project.id,
        '2026-03-01',
      ),
    ).toMatchObject({ revisionId: revisionIdValue, effectiveFrom: '2026-01-01' });
    expect(() =>
      value.sqlite
        .prepare('UPDATE project_legal_entity_assignment SET effective_to=? WHERE assignment_id=?')
        .run('2026-04-01', assignmentIdValue),
    ).toThrow(/legal-entity assignment immutable/i);
    expect(() =>
      value.sqlite
        .prepare('DELETE FROM project_legal_entity_assignment WHERE assignment_id=?')
        .run(assignmentIdValue),
    ).toThrow(/legal-entity assignment immutable/i);
  });
});
