import { afterEach, describe, expect, it } from 'vitest';
import {
  AccountingPackRevisionService,
  V3ConflictError,
  type AccountingPackSnapshotInput,
} from '@ja/database';
import type { Principal } from '@ja/domain';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: Array<B5LifecycleSecurityFixture & { legacyLegalEntityId: string }> = [];

type Fixture = B5LifecycleSecurityFixture & { legacyLegalEntityId: string };

function fixture(): Fixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  const legacyId = 'wp03-bridge-legacy-entity';
  const now = new Date().toISOString();
  // Exercise the Accounting Pack's legacy fallback path deliberately.  This
  // row represents a pre-Client-Essential deployment whose identifier data is
  // incomplete; the canonical command must later replace it with a fully
  // evidenced revision.  It is inserted as historical fixture state because
  // the normal legal-entity writer correctly prevents lifecycle mutation.
  value.sqlite
    .prepare(
      `INSERT INTO legal_entity(
         id,code,legal_name,currency,billing_address,company_identifiers,
         created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,1)`,
    )
    .run(
      legacyId,
      'WP03-BRIDGE-LEGACY',
      'J&A Bridge Legacy Legal Entity',
      'EUR',
      'Bridge fixture address',
      '',
      now,
      now,
    );
  return { ...value, legacyLegalEntityId: legacyId };
}

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function steppedUp(value: Fixture, principal: Principal, label: string): Principal {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  const sessionId = `wp03-bridge-${principal.userId}-${label}`;
  value.sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(sessionId, `${sessionId}-token`, principal.userId, expiresAt, now, now, now);
  return { ...principal, sessionId };
}

function command<TResult>(target: object, name: string, ...args: readonly unknown[]): TResult {
  const candidate = (target as Record<string, unknown>)[name];
  if (typeof candidate !== 'function')
    throw new Error(`Client Essential command is not implemented: ${name}`);
  return (candidate as (...values: readonly unknown[]) => TResult).apply(target, args);
}

function canonicalInput(value: Fixture, idempotencyKey: string, effectiveFrom = '2026-01-01') {
  return {
    legacyLegalEntityId: value.legacyLegalEntityId,
    effectiveFrom,
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
    idempotencyKey,
  } as const;
}

function accountingPackInput(
  value: Fixture,
  overrides: Partial<AccountingPackSnapshotInput> = {},
): AccountingPackSnapshotInput {
  return {
    periodStart: '2026-01-01',
    periodEnd: '2026-02-01',
    currency: 'EUR',
    timezone: 'Europe/Madrid',
    legacyLegalEntityId: value.legacyLegalEntityId,
    sourceItems: [
      {
        id: 'wp03-bridge-source-1',
        itemKind: 'invoice',
        sourceId: 'wp03-bridge-invoice-1',
        itemVersion: 1,
        effectiveAt: '2026-01-10T00:00:00.000Z',
        evidenceType: 'invoice_source',
        evidenceId: 'wp03-bridge-invoice-evidence-1',
        amountMinor: 1000,
        currency: 'EUR',
      },
    ],
    invoiceCount: 1,
    paymentCount: 0,
    workerCostCount: 1,
    expenseCount: 1,
    sourceItemCount: 1,
    invoiceSourceCount: 1,
    sourceMismatchCount: 0,
    approvedTimeEntryCount: 1,
    approvedExpenseCount: 1,
    netMinor: 1000,
    taxMinor: 200,
    grossMinor: 1200,
    collectedMinor: 0,
    outstandingMinor: 1200,
    workerCostMinor: 200,
    expenseCostMinor: 100,
    directCostMinor: 300,
    contributionMinor: 700,
    createdAt: '2026-01-01T00:00:00.000Z',
    effectiveAt: '2026-01-01T00:00:00.000Z',
    idempotencyKey: 'wp03:bridge:accounting-pack:base',
    ...overrides,
  };
}

function createCanonicalRevision(
  value: Fixture,
  principal: Principal,
  idempotencyKey: string,
  effectiveFrom = '2026-01-01',
) {
  return command<Record<string, unknown>>(
    value.v3,
    'createCanonicalLegalEntityRevision',
    principal,
    canonicalInput(value, idempotencyKey, effectiveFrom),
  );
}

function assignCanonicalRevision(
  value: Fixture,
  principal: Principal,
  projectId: string,
  legalEntityRevisionId: string,
  idempotencyKey: string,
  effectiveFrom = '2026-01-01',
  effectiveTo?: string,
) {
  return command<Record<string, unknown>>(
    value.v3,
    'assignCanonicalLegalEntityToProject',
    principal,
    {
      projectId,
      legalEntityRevisionId,
      effectiveFrom,
      ...(effectiveTo === undefined ? {} : { effectiveTo }),
      reason: 'Bind project to the canonical Client Essential legal-entity authority',
      idempotencyKey,
    },
  );
}

function stringResult(result: Record<string, unknown>, key: string): string {
  const value = result[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Result omitted ${key}`);
  return value;
}

describe('Client Essential legal-entity authority and Accounting Pack bridge', () => {
  it('lets a canonical Client Essential identity lead and Accounting Pack reuse its bridge', () => {
    const value = fixture();
    const finance = steppedUp(value, value.finance, 'canonical-first');
    const canonical = createCanonicalRevision(value, finance, 'wp03:bridge:canonical-first');
    const canonicalRevisionId = stringResult(canonical, 'revisionId');

    const pack = new AccountingPackRevisionService(value.sqlite).createCanonicalRevision(
      finance,
      accountingPackInput(value, {
        legalEntityRevisionId: canonicalRevisionId,
        idempotencyKey: 'wp03:bridge:pack-after-canonical',
      }),
    );

    expect(pack.legalEntityRevisionId).toBe(canonicalRevisionId);
    expect(pack.entityBridgeId).toMatch(/^ce-legal-entity-bridge-/u);
    expect(
      value.sqlite
        .prepare(
          'SELECT COUNT(*) AS count FROM legal_entity_revision_bridge WHERE legacy_legal_entity_id=?',
        )
        .get(value.legacyLegalEntityId),
    ).toEqual({ count: 1 });
    expect(
      value.sqlite
        .prepare(
          'SELECT canonical_revision_id FROM legal_entity_revision_bridge WHERE legacy_legal_entity_id=?',
        )
        .get(value.legacyLegalEntityId),
    ).toEqual({ canonical_revision_id: canonicalRevisionId });
  });

  it('upgrades a legacy Accounting Pack placeholder into one full Client Essential authority', () => {
    const value = fixture();
    const finance = steppedUp(value, value.finance, 'legacy-first');
    const accounting = new AccountingPackRevisionService(value.sqlite);
    const legacyPack = accounting.createCanonicalRevision(
      finance,
      accountingPackInput(value, { idempotencyKey: 'wp03:bridge:legacy-first' }),
    );
    const placeholderRevisionId = legacyPack.legalEntityRevisionId;
    expect(
      value.sqlite
        .prepare(
          `SELECT legal_name,tax_identifier,registration_identifier,address_line1,locality,
                  postal_code,country_code
             FROM legal_entity_revision WHERE revision_id=?`,
        )
        .get(placeholderRevisionId),
    ).toMatchObject({
      tax_identifier: `legacy:${value.legacyLegalEntityId}`,
      registration_identifier: null,
      locality: 'N/A',
      postal_code: '00000',
      country_code: 'US',
    });

    const canonical = createCanonicalRevision(value, finance, 'wp03:bridge:upgrade', '2026-02-01');
    const canonicalRevisionId = stringResult(canonical, 'revisionId');
    expect(canonicalRevisionId).not.toBe(placeholderRevisionId);
    expect(
      value.sqlite
        .prepare(
          'SELECT COUNT(*) AS count FROM legal_entity_revision_bridge WHERE legacy_legal_entity_id=?',
        )
        .get(value.legacyLegalEntityId),
    ).toEqual({ count: 1 });

    const bridge = value.sqlite
      .prepare(
        `SELECT b.canonical_revision_id,b.bridge_id,r.series_id
           FROM legal_entity_revision_bridge b
           JOIN legal_entity_revision r ON r.revision_id=b.canonical_revision_id
          WHERE b.legacy_legal_entity_id=?`,
      )
      .get(value.legacyLegalEntityId) as
      | { canonical_revision_id: string; bridge_id: string; series_id: string }
      | undefined;
    // The immutable bridge remains the historical identity link created by
    // Accounting Pack.  Canonical configuration adopts its series and adds a
    // fully evidenced successor rather than mutating that bridge or creating
    // a second one.
    expect(bridge).toMatchObject({ canonical_revision_id: placeholderRevisionId });
    expect(
      value.sqlite
        .prepare(
          `SELECT series_id,tax_identifier,registration_identifier,locality,postal_code,country_code
             FROM legal_entity_revision WHERE revision_id=?`,
        )
        .get(canonicalRevisionId),
    ).toMatchObject({
      series_id: bridge?.series_id,
      tax_identifier: 'ESB12345678',
      registration_identifier: 'REG-MAD-001',
      locality: 'Madrid',
      postal_code: '28001',
      country_code: 'ES',
    });

    const assignment = assignCanonicalRevision(
      value,
      finance,
      value.project.id,
      canonicalRevisionId,
      'wp03:bridge:upgrade:assignment',
      '2026-02-01',
    );
    expect(assignment).toMatchObject({ legalEntityRevisionId: canonicalRevisionId });
    expect(
      value.sqlite
        .prepare(
          'SELECT legal_entity_revision_id FROM project_legal_entity_assignment WHERE assignment_id=?',
        )
        .get(stringResult(assignment, 'assignmentId')),
    ).toEqual({ legal_entity_revision_id: canonicalRevisionId });
  });

  it('rejects an Accounting Pack placeholder as project canonical authority', () => {
    const value = fixture();
    const finance = steppedUp(value, value.finance, 'placeholder-assignment');
    const pack = new AccountingPackRevisionService(value.sqlite).createCanonicalRevision(
      finance,
      accountingPackInput(value, { idempotencyKey: 'wp03:bridge:placeholder-assignment' }),
    );
    const before = value.sqlite
      .prepare('SELECT COUNT(*) AS count FROM project_legal_entity_assignment WHERE project_id=?')
      .get(value.project.id);

    expect(() =>
      assignCanonicalRevision(
        value,
        finance,
        value.project.id,
        pack.legalEntityRevisionId,
        'wp03:bridge:placeholder-assignment:command',
        '2026-01-02',
      ),
    ).toThrow(V3ConflictError);
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) AS count FROM project_legal_entity_assignment WHERE project_id=?')
        .get(value.project.id),
    ).toEqual(before);
  });

  it('preserves inclusive assignment boundaries at the exact hand-off date', () => {
    const value = fixture();
    const finance = steppedUp(value, value.finance, 'inclusive-boundary');
    const first = createCanonicalRevision(value, finance, 'wp03:bridge:inclusive:first');
    const firstId = stringResult(first, 'revisionId');
    const second = command<Record<string, unknown>>(
      value.v3,
      'createCanonicalLegalEntityRevision',
      finance,
      canonicalInput(value, 'wp03:bridge:inclusive:second', '2026-07-01'),
    );
    const secondId = stringResult(second, 'revisionId');

    assignCanonicalRevision(
      value,
      finance,
      value.project.id,
      firstId,
      'wp03:bridge:inclusive:first-assignment',
      '2026-01-01',
      '2026-06-30',
    );
    assignCanonicalRevision(
      value,
      finance,
      value.project.id,
      secondId,
      'wp03:bridge:inclusive:second-assignment',
      '2026-07-01',
    );

    expect(
      command<Record<string, unknown>>(
        value.v3,
        'resolveCanonicalProjectLegalEntity',
        finance,
        value.project.id,
        '2026-06-30',
      ),
    ).toMatchObject({ revisionId: firstId });
    expect(
      command<Record<string, unknown>>(
        value.v3,
        'resolveCanonicalProjectLegalEntity',
        finance,
        value.project.id,
        '2026-07-01',
      ),
    ).toMatchObject({ revisionId: secondId });
  });
});
