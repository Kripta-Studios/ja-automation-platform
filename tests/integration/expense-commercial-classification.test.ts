import { afterEach, describe, expect, it } from 'vitest';
import type { Principal } from '@ja/domain';
import {
  AccessDeniedError,
  ConflictError,
  ReadinessError,
  ValidationError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
} from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

/**
 * This packet freezes the server-side contract before the repository façade is
 * changed.  The intentionally structural type keeps the RED tests runnable
 * while the production method is being introduced; it must not become a
 * second application API.
 */
type ExpenseContract = {
  createExpense(
    principal: Principal,
    input: Record<string, unknown>,
  ): { id: string; version: number };
  submitExpense(principal: Principal, id: string, version: number): { id: string; version: number };
  operationalApproveExpense(
    principal: Principal,
    id: string,
    decision: 'approved' | 'needs_changes' | 'rejected',
    reason?: string,
  ): void;
  classifyExpenseCommercially(
    principal: Principal,
    input: Record<string, unknown>,
  ): { id: string; version: number; classificationState: 'classified' };
  listExpensesForScope(principal: Principal): Array<Record<string, unknown>>;
  expenseDetail(principal: Principal, id: string): Record<string, unknown>;
};

function expenseContract(value: B5LifecycleSecurityFixture): ExpenseContract {
  return value.repository as unknown as ExpenseContract;
}

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  const legacy = value.repository.createLegalEntity(value.owner, {
    code: 'EXPENSE-LEGACY',
    legalName: 'Expense Classification Legacy Entity',
    currency: 'EUR',
    billingAddress: 'Legacy address retained for explicit canonical migration input',
    companyIdentifiers: 'EXPENSE-LEGACY-TAX',
  });
  return Object.assign(value, { legacyLegalEntityId: legacy.id });
}

type ExpenseFixture = B5LifecycleSecurityFixture & { legacyLegalEntityId: string };

function expenseFixture(): ExpenseFixture {
  return fixture() as ExpenseFixture;
}

function operationalExpenseInput(value: B5LifecycleSecurityFixture): Record<string, unknown> {
  return {
    projectId: value.project.id,
    spentOn: '2026-08-20',
    vendor: 'Operational hotel',
    category: 'hotel',
    description: 'Worker lodging for the commissioning shift',
    currency: 'EUR',
    amountMinor: 12_345n,
    whoPaid: 'worker',
    receiptRequired: false,
  };
}

function stepUpFinance(value: B5LifecycleSecurityFixture): Principal {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  value.sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      'expense-classification-session',
      'expense-classification-token',
      value.finance.userId,
      expiresAt,
      now,
      now,
      now,
    );
  return { ...value.finance, sessionId: 'expense-classification-session' };
}

function canonicalCommand<TResult>(
  target: object,
  name: string,
  ...args: readonly unknown[]
): TResult {
  const candidate = (target as Record<string, unknown>)[name];
  if (typeof candidate !== 'function')
    throw new Error(`Client Essential command is not implemented: ${name}`);
  return (candidate as (...values: readonly unknown[]) => TResult).apply(target, args);
}

function canonicalLegalEntityInput(value: ExpenseFixture, idempotencyKey: string) {
  return {
    legacyLegalEntityId: value.legacyLegalEntityId,
    effectiveFrom: '2026-01-01',
    legalName: 'Expense Classification Canonical Entity S.L.',
    taxIdentifier: 'ESB87654321',
    registrationIdentifier: 'EXP-REG-001',
    addressLine1: 'Calle de la Industria 42',
    addressLine2: 'Planta 3',
    locality: 'Madrid',
    region: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR' as const,
    timezone: 'Europe/Madrid',
    reason: 'Establish canonical authority before expense commercial interpretation',
    idempotencyKey,
  };
}

function canonicalAuthority(value: ExpenseFixture, finance: Principal, keyPrefix: string) {
  const revision = canonicalCommand<Record<string, unknown>>(
    value.v3,
    'createCanonicalLegalEntityRevision',
    finance,
    canonicalLegalEntityInput(value, `${keyPrefix}:revision`),
  );
  const revisionId = revision.revisionId;
  if (typeof revisionId !== 'string' || !revisionId)
    throw new Error('Canonical legal-entity revision result omitted revisionId');
  const assignment = canonicalCommand<Record<string, unknown>>(
    value.v3,
    'assignCanonicalLegalEntityToProject',
    finance,
    {
      projectId: value.project.id,
      legalEntityRevisionId: revisionId,
      effectiveFrom: '2026-01-01',
      reason: 'Bind project to canonical legal-entity authority for classification',
      idempotencyKey: `${keyPrefix}:assignment`,
    },
  );
  return { revisionId, assignmentId: assignment.assignmentId };
}

function rowCounts(value: ExpenseFixture, expenseId: string) {
  const count = (sql: string, ...args: readonly unknown[]): number =>
    Number((value.sqlite.prepare(sql).get(...args) as { count: number }).count);
  return {
    financeCommand: count('SELECT COUNT(*) AS count FROM finance_command'),
    financeEvidence: count('SELECT COUNT(*) AS count FROM finance_hash_evidence'),
    classificationSeries: count(
      'SELECT COUNT(*) AS count FROM expense_classification_series WHERE expense_id=?',
      expenseId,
    ),
    classificationRevision: count(
      'SELECT COUNT(*) AS count FROM expense_classification_revision WHERE expense_id=?',
      expenseId,
    ),
    classificationAuthority: count(
      `SELECT COUNT(*) AS count
         FROM expense_classification_authority_event a
         JOIN expense_classification_series s ON s.id=a.series_id
        WHERE s.expense_id=?`,
      expenseId,
    ),
    financeChange: count(
      `SELECT COUNT(*) AS count FROM finance_change_event
        WHERE entity_kind='expense' AND entity_id=?`,
      expenseId,
    ),
    audit: count("SELECT COUNT(*) AS count FROM audit_event WHERE entity_type='expense'"),
  };
}

function expectControlledClassificationFailure(fn: () => unknown): void {
  let failure: unknown;
  try {
    fn();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  if (
    failure instanceof TypeError &&
    /classifyExpenseCommercially is not a function/u.test(String(failure))
  ) {
    expect(String(failure)).toContain('classifyExpenseCommercially');
    return;
  }
  expect(
    [
      ReadinessError,
      ConflictError,
      ValidationError,
      V3AccessDeniedError,
      V3ConflictError,
      V3ValidationError,
    ].some((type) => failure instanceof type),
  ).toBe(true);
  expect(String(failure)).toMatch(/canonical|legal.entity|assignment|readiness|authority/i);
}

const commercialKeys = [
  'client_treatment',
  'clientTreatment',
  'billing_treatment',
  'billingTreatment',
  'billing_amount_minor',
  'billingAmountMinor',
  'billing_state',
  'billingState',
  'invoice_id',
  'invoiceId',
  'markup_bps',
  'markupBps',
  'tax_amount_minor',
  'taxAmountMinor',
  'tax_profile_id',
  'taxProfileId',
  'fx_rate_bps',
  'fxRateBps',
  'project_currency_amount_minor',
  'projectCurrencyAmountMinor',
  'internal_cost_minor',
  'internalCostMinor',
  'client_rate_minor',
  'clientRateMinor',
  'contribution_minor',
  'contributionMinor',
  'contribution_margin_bps',
  'contributionMarginBps',
] as const;

function expectNoCommercialFields(row: Record<string, unknown>): void {
  for (const key of commercialKeys) expect(row).not.toHaveProperty(key);
}

function expectOwnReimbursementOnly(row: Record<string, unknown>): void {
  expectNoCommercialFields(row);
  expect(row).toHaveProperty('reimbursement_state');
  expect(row).not.toHaveProperty('expected_recovery_on');
  expect(row).not.toHaveProperty('expectedRecoveryOn');
  expect(row).not.toHaveProperty('recovery_state');
  expect(row).not.toHaveProperty('recoveryState');
  expect(row).not.toHaveProperty('actual_recovery_on');
  expect(row).not.toHaveProperty('actualRecoveryOn');
}

describe('Client Essential CORE-06 expense commercial classification boundary', () => {
  it('creates an operational expense without requiring or fabricating commercial treatment', () => {
    const value = fixture();
    const repository = expenseContract(value);

    const input = operationalExpenseInput(value);
    expect(input).not.toHaveProperty('clientTreatment');
    expect(input).not.toHaveProperty('billingTreatment');
    expect(input).not.toHaveProperty('markupBps');
    expect(input).not.toHaveProperty('taxAmountMinor');
    expect(input).not.toHaveProperty('fxRateBps');

    const created = repository.createExpense(value.worker, input);
    const stored = value.sqlite
      .prepare(
        `SELECT commercial_classification_state,client_treatment,billing_treatment,
                markup_bps,tax_amount_minor,fx_rate_bps,approval_state,reimbursement_state
         FROM expense WHERE id=?`,
      )
      .get(created.id) as Record<string, unknown>;

    expect(stored.commercial_classification_state).toBe('unclassified');
    expect(stored.approval_state).toBe('draft');
    expect(stored.reimbursement_state).toBe('pending');
    // The legacy columns remain NOT NULL for historical compatibility.  Their
    // placeholder values must not be mistaken for an authoritative Finance
    // classification while the explicit state remains `unclassified`.
    expect(stored.client_treatment).toBe('non_billable');
    expect(stored.billing_treatment).toBe('internal_non_billable');
    expect(stored.markup_bps).toBeNull();
    expect(stored.tax_amount_minor).toBeNull();
    expect(stored.fx_rate_bps).toBeNull();
  });

  it('does not trust forged commercial fields in a Worker create payload', () => {
    const value = fixture();
    const repository = expenseContract(value);
    const forged = {
      ...operationalExpenseInput(value),
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_plus_markup',
      markupBps: 1_500,
      taxAmountMinor: 2_000n,
      fxRateBps: 10_000,
      internalCostMinor: 999_999n,
      clientRateMinor: 888_888n,
    };

    let created: { id: string; version: number } | undefined;
    try {
      created = repository.createExpense(value.worker, forged);
    } catch (error) {
      expect(String(error)).toMatch(/commercial|finance|role|forbidden|not allowed|payload/i);
      return;
    }

    const stored = value.sqlite
      .prepare(
        `SELECT commercial_classification_state,client_treatment,billing_treatment,
                markup_bps,tax_amount_minor,fx_rate_bps
         FROM expense WHERE id=?`,
      )
      .get(created.id) as Record<string, unknown>;
    expect(stored.commercial_classification_state).toBe('unclassified');
    expect(stored.client_treatment).toBe('non_billable');
    expect(stored.billing_treatment).toBe('internal_non_billable');
    expect(stored.markup_bps).toBeNull();
    expect(stored.tax_amount_minor).toBeNull();
    expect(stored.fx_rate_bps).toBeNull();
  });

  it('keeps PM approval operational and omits commercial and reimbursement details from PM DTOs', () => {
    const value = fixture();
    const repository = expenseContract(value);
    const created = repository.createExpense(value.worker, operationalExpenseInput(value));
    repository.submitExpense(value.worker, created.id, created.version);
    repository.operationalApproveExpense(value.manager, created.id, 'approved');

    const pmRow = repository
      .listExpensesForScope(value.manager)
      .find((row) => row.id === created.id);
    expect(pmRow).toBeDefined();
    if (!pmRow) return;
    expect(pmRow.approval_state).toBe('approved');
    expectNoCommercialFields(pmRow);
    expect(pmRow).not.toHaveProperty('reimbursement_state');
    expect(pmRow).not.toHaveProperty('reimbursementState');
    expect(pmRow).not.toHaveProperty('expected_reimbursement_on');
    expect(pmRow).not.toHaveProperty('expectedReimbursementOn');

    const pmDetail = repository.expenseDetail(value.manager, created.id);
    expectNoCommercialFields(pmDetail);
    expect(pmDetail).not.toHaveProperty('reimbursement_state');
    expect(pmDetail).not.toHaveProperty('reimbursementState');
    expect(pmDetail).not.toHaveProperty('expected_reimbursement_on');
    expect(pmDetail).not.toHaveProperty('expectedReimbursementOn');
    expect(pmDetail).not.toHaveProperty('expected_recovery_on');
    expect(pmDetail).not.toHaveProperty('expectedRecoveryOn');
  });

  it('gives a Worker only their own reimbursement axis and never the client-recovery axis', () => {
    const value = fixture();
    const repository = expenseContract(value);
    const created = repository.createExpense(value.worker, operationalExpenseInput(value));
    value.sqlite
      .prepare(
        `UPDATE expense
            SET reimbursement_state='scheduled',expected_reimbursement_on='2026-09-05',
                expected_recovery_on='2026-09-20',billing_state='invoiced',
                billing_treatment='reimbursable_at_cost'
          WHERE id=?`,
      )
      .run(created.id);

    const workerRow = repository
      .listExpensesForScope(value.worker)
      .find((row) => row.id === created.id);
    expect(workerRow).toBeDefined();
    if (!workerRow) return;
    expectOwnReimbursementOnly(workerRow);
    expect(workerRow.reimbursement_state).toBe('scheduled');
    expect(workerRow.expected_reimbursement_on).toBe('2026-09-05');

    const workerDetail = repository.expenseDetail(value.worker, created.id);
    expectOwnReimbursementOnly(workerDetail);
    expect(workerDetail.expected_reimbursement_on).toBe('2026-09-05');
  });

  it('allows only stepped-up Finance/Admin to classify with an expected version and reason, append a revision, and reject stale writes', () => {
    const value = expenseFixture();
    const repository = expenseContract(value);
    const created = repository.createExpense(value.worker, operationalExpenseInput(value));
    const finance = stepUpFinance(value);
    const authority = canonicalAuthority(value, finance, 'wp03:expense-classification:happy');
    expect(authority.revisionId).toMatch(/\S/u);
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) AS count FROM billing_rule WHERE project_id=?')
        .get(value.project.id),
    ).toEqual({ count: 0 });

    expect(() =>
      repository.classifyExpenseCommercially(value.worker, {
        expenseId: created.id,
        expectedVersion: created.version,
        clientTreatment: 'reimbursable',
        billingTreatment: 'reimbursable_at_cost',
        reason: 'Worker must not classify client treatment',
        idempotencyKey: 'wp03:expense-classification:worker-forged',
      }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      repository.classifyExpenseCommercially(value.manager, {
        expenseId: created.id,
        expectedVersion: created.version,
        clientTreatment: 'reimbursable',
        billingTreatment: 'reimbursable_at_cost',
        reason: 'PM has operational approval only',
        idempotencyKey: 'wp03:expense-classification:pm-forged',
      }),
    ).toThrow(AccessDeniedError);

    const classified = repository.classifyExpenseCommercially(finance, {
      expenseId: created.id,
      expectedVersion: created.version,
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      markupBps: 0,
      taxBps: 0,
      reason: 'Finance classified worker-paid project lodging for recovery at cost',
      idempotencyKey: 'wp03:expense-classification:happy:v1',
    });
    expect(classified).toMatchObject({
      id: created.id,
      version: created.version + 1,
      classificationState: 'classified',
    });

    const stored = value.sqlite
      .prepare(
        `SELECT commercial_classification_state,client_treatment,billing_treatment,
                markup_bps,version FROM expense WHERE id=?`,
      )
      .get(created.id) as Record<string, unknown>;
    expect(stored.commercial_classification_state).toBe('classified');
    expect(stored.client_treatment).toBe('reimbursable');
    expect(stored.billing_treatment).toBe('reimbursable_at_cost');
    expect(stored.markup_bps).toBe(0);
    expect(stored.version).toBe(created.version + 1);

    const exactReplay = repository.classifyExpenseCommercially(finance, {
      expenseId: created.id,
      expectedVersion: created.version,
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      markupBps: 0,
      taxBps: 0,
      reason: 'Finance classified worker-paid project lodging for recovery at cost',
      idempotencyKey: 'wp03:expense-classification:happy:v1',
    });
    expect(exactReplay).toEqual(classified);

    expect(() =>
      repository.classifyExpenseCommercially(finance, {
        expenseId: created.id,
        expectedVersion: created.version,
        clientTreatment: 'non_billable',
        billingTreatment: 'internal_non_billable',
        reason: 'Stale classification must not overwrite the active revision',
        idempotencyKey: 'wp03:expense-classification:happy:v1',
      }),
    ).toThrow(ConflictError);

    const revised = repository.classifyExpenseCommercially(finance, {
      expenseId: created.id,
      expectedVersion: created.version + 1,
      clientTreatment: 'non_billable',
      billingTreatment: 'internal_non_billable',
      markupBps: 0,
      taxBps: 0,
      reason: 'Finance superseded the prior classification after recovery decision',
      idempotencyKey: 'wp03:expense-classification:happy:v2',
    });
    expect(revised).toMatchObject({
      id: created.id,
      version: created.version + 2,
      classificationState: 'classified',
    });
    const revisions = value.sqlite
      .prepare(
        `SELECT id,revision_number,predecessor_revision_id,reason,created_by
           FROM expense_classification_revision
          WHERE expense_id=? ORDER BY revision_number`,
      )
      .all(created.id) as Array<Record<string, unknown>>;
    expect(revisions).toHaveLength(2);
    expect(revisions[1]).toMatchObject({
      revision_number: 2,
      predecessor_revision_id: revisions[0]?.id,
      reason: 'Finance superseded the prior classification after recovery decision',
      created_by: finance.userId,
    });
    expect(
      value.sqlite
        .prepare(
          `SELECT event_type,revision_id FROM expense_classification_authority_event
            WHERE series_id=(SELECT series_id FROM expense_classification_series WHERE expense_id=?)
            ORDER BY created_at`,
        )
        .all(created.id),
    ).toEqual([
      { event_type: 'activate', revision_id: revisions[0]?.id },
      { event_type: 'supersede', revision_id: revisions[1]?.id },
    ]);
  });

  it('replaces stale derived monetary projections with exact same-currency classification values', () => {
    const value = expenseFixture();
    const repository = expenseContract(value);
    const created = repository.createExpense(value.worker, operationalExpenseInput(value));
    const finance = stepUpFinance(value);
    canonicalAuthority(value, finance, 'wp03:expense-classification:derived-values');
    value.sqlite
      .prepare(
        `UPDATE expense
            SET billing_amount_minor=99123,project_currency_amount_minor=88123,
                tax_amount_minor=77123,fx_rate_bps=66123
          WHERE id=?`,
      )
      .run(created.id);

    repository.classifyExpenseCommercially(finance, {
      expenseId: created.id,
      expectedVersion: created.version,
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_plus_markup',
      markupBps: 1_000,
      taxBps: 2_100,
      reason: 'Finance changed treatment; dependent amounts require canonical recalculation',
      idempotencyKey: 'wp03:expense-classification:derived-values:v1',
    });

    expect(
      value.sqlite
        .prepare(
          `SELECT billing_amount_minor,project_currency_amount_minor,tax_amount_minor,fx_rate_bps
             FROM expense WHERE id=?`,
        )
        .get(created.id),
    ).toEqual({
      billing_amount_minor: 13_580,
      project_currency_amount_minor: 12_345,
      tax_amount_minor: 2_852,
      fx_rate_bps: null,
    });
    const financeProjection = repository
      .listExpensesForScope(finance)
      .find((row) => row.id === created.id);
    expect(financeProjection).toBeDefined();
    expect(financeProjection).toMatchObject({
      billing_amount_minor: 13_580,
      project_currency_amount_minor: 12_345,
      tax_amount_minor: 2_852,
      fx_rate_bps: null,
    });
  });

  it('rejects contradictory treatment pairs and markup outside marked-up reimbursement', () => {
    const value = expenseFixture();
    const repository = expenseContract(value);
    const finance = stepUpFinance(value);
    canonicalAuthority(value, finance, 'wp03:expense-classification:pair-validation');

    const invalid = [
      ['all_in', 'reimbursable_at_cost', 0],
      ['reimbursable', 'all_in', 0],
      ['non_billable', 'reimbursable_plus_markup', 1_000],
      ['reimbursable', 'reimbursable_at_cost', 1],
      ['reimbursable', 'reimbursable_plus_markup', 0],
    ] as const;
    for (const [clientTreatment, billingTreatment, markupBps] of invalid) {
      const created = repository.createExpense(value.worker, operationalExpenseInput(value));
      expect(() =>
        repository.classifyExpenseCommercially(finance, {
          expenseId: created.id,
          expectedVersion: created.version,
          clientTreatment,
          billingTreatment,
          markupBps,
          taxBps: 0,
          reason: 'Contradictory classification must be rejected',
          idempotencyKey: `wp03:expense-classification:invalid:${clientTreatment}:${billingTreatment}:${markupBps}`,
        }),
      ).toThrow(ValidationError);
    }
  });

  it('uses exact same-currency marked-up projections in project finance and invoice billing', () => {
    const value = expenseFixture();
    const repository = expenseContract(value);
    const finance = stepUpFinance(value);
    canonicalAuthority(value, finance, 'wp03:expense-classification:markup-billing');
    const created = repository.createExpense(value.worker, operationalExpenseInput(value));
    const classified = repository.classifyExpenseCommercially(finance, {
      expenseId: created.id,
      expectedVersion: created.version,
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_plus_markup',
      markupBps: 1_000,
      taxBps: 0,
      reason: 'Recover the same-currency approved expense with ten percent markup',
      idempotencyKey: 'wp03:expense-classification:markup-billing:v1',
    });
    expect(
      value.sqlite
        .prepare(
          `SELECT project_currency_amount_minor,billing_amount_minor,tax_amount_minor,fx_rate_bps
             FROM expense WHERE id=?`,
        )
        .get(created.id),
    ).toEqual({
      project_currency_amount_minor: 12_345,
      billing_amount_minor: 13_580,
      tax_amount_minor: 0,
      fx_rate_bps: null,
    });
    repository.submitExpense(value.worker, created.id, classified.version);
    repository.operationalApproveExpense(value.manager, created.id, 'approved');
    value.repository.financeApproveExpense(finance, created.id);
    const entity = value.repository.createLegalEntity(value.owner, {
      code: 'EXP-MARKUP',
      legalName: 'Expense Markup Entity S.L.',
      currency: 'EUR',
      billingAddress: 'Calle Exact Money 1, Madrid',
      companyIdentifiers: 'ESB11223344',
    });
    const tax = value.repository.createTaxProfile(finance, {
      name: 'Expense markup no tax',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'No tax', basisPoints: 0 }],
    });
    const rule = value.repository.createBillingRule(finance, {
      projectId: value.project.id,
      legalEntityId: entity.id,
      streamType: 'expense',
      cadenceType: 'monthly',
      taxProfileId: tax.id,
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
    });
    const projectFinance = value.repository.projectFinance(finance, value.project.id);
    expect(projectFinance).toMatchObject({
      state: 'ready',
      approvedCostMinor: '12345',
      revenueCandidateMinor: '13580',
      contributionMarginMinor: '1235',
    });
    expect(value.v3.projectFinance(finance, value.project.id)).toMatchObject({
      state: 'ready',
      approvedCostMinor: '12345',
      expenseRevenueMinor: '13580',
      contributionMarginMinor: '1235',
    });
    const invoice = value.repository.createInvoiceDraft(
      finance,
      rule.id,
      '2026-08-01',
      '2026-08-31',
    );
    expect(
      value.sqlite
        .prepare('SELECT subtotal_minor,total_minor FROM invoice WHERE id=?')
        .get(invoice.id),
    ).toEqual({ subtotal_minor: 13_580, total_minor: 13_580 });
  });

  it('excludes foreign-currency classified expense money and blocks billing without conversion', () => {
    const value = expenseFixture();
    const repository = expenseContract(value);
    const finance = stepUpFinance(value);
    canonicalAuthority(value, finance, 'wp03:expense-classification:foreign-fail-closed');
    const created = repository.createExpense(value.worker, {
      ...operationalExpenseInput(value),
      currency: 'USD',
      amountMinor: 20_001n,
    });
    const classified = repository.classifyExpenseCommercially(finance, {
      expenseId: created.id,
      expectedVersion: created.version,
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      markupBps: 0,
      taxBps: 0,
      reason: 'Foreign source awaits authoritative EUR conversion evidence',
      idempotencyKey: 'wp03:expense-classification:foreign-fail-closed:v1',
    });
    repository.submitExpense(value.worker, created.id, classified.version);
    repository.operationalApproveExpense(value.manager, created.id, 'approved');
    value.repository.financeApproveExpense(finance, created.id);
    value.sqlite
      .prepare("UPDATE expense SET commercial_classification_state='legacy_classified' WHERE id=?")
      .run(created.id);

    expect(
      value.sqlite
        .prepare(
          'SELECT project_currency_amount_minor,billing_amount_minor,tax_amount_minor,fx_rate_bps FROM expense WHERE id=?',
        )
        .get(created.id),
    ).toEqual({
      project_currency_amount_minor: null,
      billing_amount_minor: null,
      tax_amount_minor: null,
      fx_rate_bps: null,
    });
    expect(value.repository.projectFinance(finance, value.project.id)).toMatchObject({
      state: 'incomplete',
      approvedCostMinor: '0',
      revenueCandidateMinor: '0',
      reasons: [{ code: 'missing_expense_currency_conversion', sourceId: created.id }],
    });
    expect(value.v3.projectFinance(finance, value.project.id)).toMatchObject({
      state: 'incomplete',
      approvedCostMinor: '0',
      expenseRevenueMinor: '0',
      reasons: [{ code: 'missing_expense_currency_conversion', sourceId: created.id }],
    });

    const entity = value.repository.createLegalEntity(value.owner, {
      code: 'EXP-FOREIGN',
      legalName: 'Foreign Expense Entity S.L.',
      currency: 'EUR',
      billingAddress: 'Calle Fail Closed 1, Madrid',
      companyIdentifiers: 'ESB55667788',
    });
    const tax = value.repository.createTaxProfile(finance, {
      name: 'Foreign expense no tax',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'No tax', basisPoints: 0 }],
    });
    const rule = value.repository.createBillingRule(finance, {
      projectId: value.project.id,
      legalEntityId: entity.id,
      streamType: 'expense',
      cadenceType: 'monthly',
      taxProfileId: tax.id,
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
    });
    expect(
      value.repository.billingReadiness(finance, rule.id, '2026-08-01', '2026-08-31'),
    ).toMatchObject({
      state: 'incomplete',
      reasons: [{ code: 'missing_expense_currency_conversion', sourceId: created.id }],
    });
    expect(value.v3.billingReadiness(finance, rule.id, '2026-08-01', '2026-08-31')).toMatchObject({
      state: 'incomplete',
      reasons: expect.arrayContaining([
        { code: 'missing_expense_currency_conversion', sourceId: created.id },
      ]),
    });
    expect(value.v3.closeBillingPeriod(finance, rule.id, '2026-08-01', '2026-08-31')).toMatchObject(
      { closed: false, state: 'incomplete' },
    );
    expect(
      value.sqlite
        .prepare('SELECT billing_state,billing_lock_id FROM expense WHERE id=?')
        .get(created.id),
    ).toEqual({ billing_state: 'unlocked', billing_lock_id: null });
    expect(() =>
      value.repository.createInvoiceDraft(finance, rule.id, '2026-08-01', '2026-08-31'),
    ).toThrow(ReadinessError);
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) AS count FROM invoice WHERE billing_rule_id=?')
        .get(rule.id),
    ).toEqual({ count: 0 });
    expect(
      value.sqlite
        .prepare(
          'SELECT COUNT(*) AS count FROM invoice_source s JOIN invoice i ON i.id=s.invoice_id WHERE i.billing_rule_id=?',
        )
        .get(rule.id),
    ).toEqual({ count: 0 });

    value.sqlite
      .prepare(
        'UPDATE expense SET project_currency_amount_minor=18000,billing_amount_minor=18000 WHERE id=?',
      )
      .run(created.id);
    const draft = value.repository.createInvoiceDraft(finance, rule.id, '2026-08-01', '2026-08-31');
    value.repository.approveInvoiceDraft(finance, draft.id);
    const source = value.sqlite
      .prepare(
        "SELECT source_link_id,invoice_id,source_type,source_id,source_version FROM invoice_source WHERE invoice_id=? AND source_type='expense'",
      )
      .get(draft.id) as {
      source_link_id: string;
      invoice_id: string;
      source_type: string;
      source_id: string;
      source_version: number;
    };
    value.sqlite
      .prepare('DELETE FROM invoice_source WHERE source_link_id=?')
      .run(source.source_link_id);
    value.sqlite
      .prepare('UPDATE expense SET project_currency_amount_minor=NULL WHERE id=?')
      .run(created.id);
    value.sqlite
      .prepare(
        'INSERT INTO invoice_source(source_link_id,invoice_id,source_type,source_id,source_version) VALUES(?,?,?,?,?)',
      )
      .run(
        source.source_link_id,
        source.invoice_id,
        source.source_type,
        source.source_id,
        source.source_version,
      );
    expect(() => value.repository.issueInvoice(finance, draft.id)).toThrow(ConflictError);
    expect(
      value.sqlite.prepare('SELECT state,invoice_number FROM invoice WHERE id=?').get(draft.id),
    ).toEqual({ state: 'approved', invoice_number: null });
  });

  it('fails closed for an approved unclassified foreign expense instead of treating source minor units as project currency', () => {
    const value = expenseFixture();
    const repository = expenseContract(value);
    const finance = stepUpFinance(value);
    const created = repository.createExpense(value.worker, {
      ...operationalExpenseInput(value),
      currency: 'USD',
      amountMinor: 20_001n,
    });
    repository.submitExpense(value.worker, created.id, created.version);
    repository.operationalApproveExpense(value.manager, created.id, 'approved');
    value.repository.financeApproveExpense(finance, created.id);

    expect(value.repository.projectFinance(finance, value.project.id)).toMatchObject({
      state: 'incomplete',
      approvedCostMinor: '0',
      revenueCandidateMinor: '0',
      reasons: [{ code: 'missing_expense_currency_conversion', sourceId: created.id }],
    });
    expect(value.v3.projectFinance(finance, value.project.id)).toMatchObject({
      state: 'incomplete',
      approvedCostMinor: '0',
      expenseRevenueMinor: '0',
      reasons: [{ code: 'missing_expense_currency_conversion', sourceId: created.id }],
    });
  });

  it('keeps worker reimbursements in source currency and refuses a mixed-currency pay total', () => {
    const value = expenseFixture();
    const repository = expenseContract(value);
    const eurExpense = repository.createExpense(value.worker, operationalExpenseInput(value));
    const usdExpense = repository.createExpense(value.worker, {
      ...operationalExpenseInput(value),
      currency: 'USD',
      amountMinor: 20_001n,
      description: 'USD lodging awaiting Finance conversion',
    });
    for (const expense of [eurExpense, usdExpense]) {
      repository.submitExpense(value.worker, expense.id, expense.version);
      repository.operationalApproveExpense(value.manager, expense.id, 'approved');
    }

    const statementExpenses = value.repository.listWorkerStatementExpenses(
      value.worker,
      '2026-08-01',
      '2026-08-31',
    );
    expect(statementExpenses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: eurExpense.id,
          currency: 'EUR',
          reimbursementAmountMinor: '12345',
        }),
        expect.objectContaining({
          id: usdExpense.id,
          currency: 'USD',
          reimbursementAmountMinor: '20001',
        }),
      ]),
    );
    expect(value.v3.listReimbursementQueue(value.finance, value.project.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: usdExpense.id,
          currency: 'USD',
          amountMinor: '20001',
          reimbursementAmountMinor: '20001',
        }),
      ]),
    );
    expect(() => value.repository.workerPay(value.worker, '2026-08-01', '2026-08-31')).toThrow(
      /multiple compensation currencies/i,
    );
    expect(() => value.v3.workerPay(value.worker, '2026-08-01', '2026-08-31')).toThrow(
      /multiple compensation currencies/i,
    );
  });

  it('does not let a rejected foreign expense poison valid EUR Worker Pay', () => {
    const value = expenseFixture();
    const repository = expenseContract(value);
    value.v3.createCompensationRule(value.finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 6_000n,
      rateBasis: 'hourly',
      effectiveFrom: '2026-01-01',
    });
    const time = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Valid EUR-compensated commissioning work',
    });
    value.repository.submitTime(value.worker, time.id, time.version);
    value.repository.operationalApproveTime(value.manager, time.id, 'approved');

    const rejectedUsd = repository.createExpense(value.worker, {
      ...operationalExpenseInput(value),
      currency: 'USD',
      amountMinor: 99_999n,
      description: 'Rejected foreign-currency expense',
    });
    repository.submitExpense(value.worker, rejectedUsd.id, rejectedUsd.version);
    repository.operationalApproveExpense(
      value.manager,
      rejectedUsd.id,
      'rejected',
      'Receipt does not support the claimed operational expense',
    );

    expect(value.v3.workerPay(value.worker, '2026-08-01', '2026-08-31')).toMatchObject({
      currency: 'EUR',
      approvedMinutes: 60,
      estimatedApprovedMinor: '6000',
      approvedReimbursementMinor: '0',
      pendingReimbursementMinor: '0',
    });
  });

  it('keeps a valid closed-period expense locked against later classification', () => {
    const value = expenseFixture();
    const repository = expenseContract(value);
    const created = repository.createExpense(value.worker, operationalExpenseInput(value));
    const finance = stepUpFinance(value);
    canonicalAuthority(value, finance, 'wp03:expense-classification:closed-period');
    const classified = repository.classifyExpenseCommercially(finance, {
      expenseId: created.id,
      expectedVersion: created.version,
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      markupBps: 0,
      taxBps: 0,
      reason: 'Finance classified the approved recovery source before period close',
      idempotencyKey: 'wp03:expense-classification:closed-period:v1',
    });
    const submitted = repository.submitExpense(value.worker, created.id, classified.version);
    repository.operationalApproveExpense(value.manager, created.id, 'approved');
    repository.financeApproveExpense(finance, created.id);

    const entity = value.repository.createLegalEntity(value.owner, {
      code: 'EXP-CLOSE',
      legalName: 'Expense Close Entity S.L.',
      currency: 'EUR',
      billingAddress: 'Calle Periodo Cerrado 1, Madrid',
      companyIdentifiers: 'ESB12345678',
    });
    const tax = value.repository.createTaxProfile(finance, {
      name: 'Expense close no tax',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'No tax', basisPoints: 0 }],
    });
    const rule = value.repository.createBillingRule(finance, {
      projectId: value.project.id,
      legalEntityId: entity.id,
      streamType: 'expense',
      cadenceType: 'monthly',
      taxProfileId: tax.id,
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
    });
    expect(value.v3.closeBillingPeriod(finance, rule.id, '2026-08-01', '2026-08-31')).toMatchObject(
      { closed: true },
    );
    const locked = value.sqlite
      .prepare('SELECT version,billing_state,billing_lock_id FROM expense WHERE id=?')
      .get(created.id) as {
      version: number;
      billing_state: string;
      billing_lock_id: string | null;
    };
    expect(locked.billing_state).toBe('locked');
    expect(locked.billing_lock_id).toMatch(/\S/u);
    expect(locked.version).toBeGreaterThan(submitted.version);
    const beforeCounts = rowCounts(value, created.id);

    expect(() =>
      repository.classifyExpenseCommercially(finance, {
        expenseId: created.id,
        expectedVersion: locked.version,
        clientTreatment: 'non_billable',
        billingTreatment: 'internal_non_billable',
        markupBps: 0,
        taxBps: 0,
        reason: 'A closed-period source must remain immutable',
        idempotencyKey: 'wp03:expense-classification:closed-period:v2',
      }),
    ).toThrow(ConflictError);
    expect(rowCounts(value, created.id)).toEqual(beforeCounts);
    expect(
      value.sqlite
        .prepare(
          'SELECT version,billing_state,billing_lock_id,client_treatment,billing_treatment FROM expense WHERE id=?',
        )
        .get(created.id),
    ).toMatchObject({
      version: locked.version,
      billing_state: 'locked',
      billing_lock_id: locked.billing_lock_id,
      client_treatment: 'reimbursable',
      billing_treatment: 'reimbursable_at_cost',
    });
  });

  it('fails closed when no canonical project legal entity is assigned and creates no finance state', () => {
    const value = expenseFixture();
    const repository = expenseContract(value);
    const created = repository.createExpense(value.worker, operationalExpenseInput(value));
    const finance = stepUpFinance(value);
    const beforeState = value.sqlite
      .prepare(
        `SELECT version,commercial_classification_state,client_treatment,billing_treatment,
                markup_bps,tax_amount_minor,fx_rate_bps
           FROM expense WHERE id=?`,
      )
      .get(created.id);
    const beforeCounts = rowCounts(value, created.id);

    expectControlledClassificationFailure(() =>
      repository.classifyExpenseCommercially(finance, {
        expenseId: created.id,
        expectedVersion: created.version,
        clientTreatment: 'reimbursable',
        billingTreatment: 'reimbursable_at_cost',
        markupBps: 0,
        taxBps: 0,
        reason: 'Classification must require canonical project legal-entity authority',
        idempotencyKey: 'wp03:expense-classification:missing-authority',
      }),
    );

    expect(rowCounts(value, created.id)).toEqual(beforeCounts);
    expect(
      value.sqlite
        .prepare(
          'SELECT version,commercial_classification_state,client_treatment,billing_treatment,markup_bps,tax_amount_minor,fx_rate_bps FROM expense WHERE id=?',
        )
        .get(created.id),
    ).toEqual(beforeState);
  });

  it('keeps Finance recovery and Worker reimbursement projections independent', () => {
    const value = fixture();
    const repository = expenseContract(value);
    const created = repository.createExpense(value.worker, operationalExpenseInput(value));
    value.sqlite
      .prepare(
        `UPDATE expense
            SET commercial_classification_state='classified',client_treatment='reimbursable',
                billing_treatment='reimbursable_at_cost',reimbursement_state='paid',
                expected_reimbursement_on='2026-09-05',reimbursed_at='2026-09-06',
                billing_state='collected',expected_recovery_on='2026-09-20'
          WHERE id=?`,
      )
      .run(created.id);

    const workerRow = repository
      .listExpensesForScope(value.worker)
      .find((row) => row.id === created.id);
    expect(workerRow).toBeDefined();
    if (!workerRow) return;
    expectOwnReimbursementOnly(workerRow);
    expect(workerRow.reimbursement_state).toBe('paid');
    expect(workerRow.reimbursed_at).toBe('2026-09-06');

    const financeRows = repository.listExpensesForScope(value.finance);
    const financeRow = financeRows.find((row) => row.id === created.id);
    expect(financeRow).toBeDefined();
    if (!financeRow) return;
    expect(financeRow).toHaveProperty('client_treatment', 'reimbursable');
    expect(financeRow).toHaveProperty('billing_treatment', 'reimbursable_at_cost');
    expect(financeRow).toHaveProperty('reimbursement_state', 'paid');
    expect(financeRow).toHaveProperty('expected_reimbursement_on', '2026-09-05');
    expect(financeRow).toHaveProperty('expected_recovery_on', '2026-09-20');
    expect(financeRow).toHaveProperty('billing_state', 'collected');
  });
});
