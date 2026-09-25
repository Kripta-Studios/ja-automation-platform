import { afterEach, describe, expect, it } from 'vitest';
import type { Principal } from '@ja/domain';
import { ReadinessError } from '@ja/database';
import { AssignmentExpensePolicyRepository } from '../../packages/database/src/domains/expenses/assignment-expense-policy-repository.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  seedB5User,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  const finance = stepUpB5Principal(value.sqlite, value.finance, 'project-reconciliation');
  const policy = new AssignmentExpensePolicyRepository(value.sqlite);
  const workers: Principal[] = [value.worker];
  for (let index = 2; index <= 8; index += 1) {
    const id = `reconciliation-worker-${index}`;
    seedB5User(value.sqlite, id, 'worker');
    value.repository.assignWorker(value.owner, {
      projectId: value.project.id,
      workerId: id,
      startsOn: '2026-08-01',
    });
    workers.push(value.repository.principalFor(id));
  }
  const memberId = (workerId: string) => {
    const row = value.sqlite
      .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
      .get(value.project.id, workerId) as { id: string } | undefined;
    if (!row) throw new Error(`Missing assignment for ${workerId}`);
    return row.id;
  };
  return { ...value, finance, policy, workers, memberId };
}

function bindCanonicalAuthority(
  value: ReturnType<typeof fixture>,
  combined = false,
  fixedAmountMinor?: bigint,
): void {
  const legalEntity = value.repository.createLegalEntity(value.owner, {
    code: 'RECON',
    legalName: 'Reconciliation Test Entity',
    currency: 'EUR',
    billingAddress: 'Test Street 1, Madrid',
    companyIdentifiers: 'ES-RECON-TEST',
  });
  const revision = value.v3.createCanonicalLegalEntityRevision(value.finance, {
    legacyLegalEntityId: legalEntity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Reconciliation Test Entity S.L.',
    taxIdentifier: 'ESB12345678',
    registrationIdentifier: 'RECON-TEST-001',
    addressLine1: 'Test Street 1',
    locality: 'Madrid',
    region: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR',
    timezone: 'Europe/Madrid',
    reason: 'Authorize the isolated expense calculation scenario',
    idempotencyKey: 'project-reconciliation:canonical-revision',
  });
  value.v3.assignCanonicalLegalEntityToProject(value.finance, {
    projectId: value.project.id,
    legalEntityRevisionId: revision.revisionId,
    effectiveFrom: '2026-01-01',
    reason: 'Bind this isolated project to the test legal entity',
    idempotencyKey: 'project-reconciliation:canonical-assignment',
  });
  const tax = value.repository.createTaxProfile(value.finance, {
    name: 'Reconciliation zero tax',
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
    components: [{ name: 'No tax', basisPoints: 0 }],
  });
  for (const streamType of (combined ? ['labor'] : ['labor', 'expense']) as Array<
    'labor' | 'expense'
  >) {
    value.repository.createBillingRule(value.finance, {
      projectId: value.project.id,
      legalEntityId: legalEntity.id,
      streamType,
      includeExpenses: combined,
      cadenceType: 'custom',
      taxProfileId: tax.id,
      currency: 'EUR',
      effectiveFrom: '2026-08-01',
      ...(streamType === 'labor' && fixedAmountMinor !== undefined ? { fixedAmountMinor } : {}),
    });
  }
}

function addApprovedExpense(
  value: ReturnType<typeof fixture>,
  input: Readonly<{
    worker: Principal;
    amountMinor: bigint;
    payer: 'worker' | 'company_direct';
    category: 'hotel' | 'meals';
    clientTreatment: 'reimbursable' | 'all_in' | 'non_billable';
    billingTreatment: 'reimbursable_at_cost' | 'all_in' | 'informational';
    key: string;
  }>,
): string {
  const created = value.repository.createExpense(input.worker, {
    projectId: value.project.id,
    spentOn: '2026-08-20',
    vendor: `${input.key} test vendor`,
    category: input.category,
    description: `${input.key} isolated reconciliation expense`,
    currency: 'EUR',
    amountMinor: input.amountMinor,
    whoPaid: input.payer,
    receiptRequired: false,
  });
  const classified = value.repository.classifyExpenseCommercially(value.finance, {
    expenseId: created.id,
    expectedVersion: created.version,
    clientTreatment: input.clientTreatment,
    billingTreatment: input.billingTreatment,
    markupBps: 0,
    taxBps: 0,
    reason: `Apply the configured ${input.key} assignment expense policy`,
    idempotencyKey: `project-reconciliation:${input.key}:classification`,
  });
  value.repository.submitExpense(input.worker, created.id, classified.version);
  value.repository.operationalApproveExpense(value.manager, created.id, 'approved');
  value.repository.financeApproveExpense(value.finance, created.id);
  return created.id;
}

function approvedLaborInvoice(value: ReturnType<typeof fixture>, combined = false) {
  bindCanonicalAuthority(value, combined);
  const rate = value.v3.createClientLaborRate(value.finance, {
    projectId: value.project.id,
    workerId: value.worker.userId,
    currency: 'EUR',
    hourlyRateMinor: 5_500n,
    effectiveFrom: '2026-08-01',
  });
  const time = value.repository.createTimeEntry(value.worker, {
    projectId: value.project.id,
    workDate: '2026-08-20',
    category: 'regular',
    minutes: 480,
    summary: 'Approved invoice recovery test',
  });
  value.repository.submitTime(value.worker, time.id, time.version);
  value.repository.operationalApproveTime(value.manager, time.id, 'approved');
  value.repository.financeApproveTime(value.finance, time.id, true);
  const rule = value.sqlite
    .prepare(
      "SELECT id,legal_entity_id,tax_profile_id FROM billing_rule WHERE project_id=? AND stream_type='labor'",
    )
    .get(value.project.id) as { id: string; legal_entity_id: string; tax_profile_id: string };
  const draft = value.repository.createInvoiceDraft(
    value.finance,
    rule.id,
    '2026-08-20',
    '2026-08-20',
  );
  value.repository.approveInvoiceDraft(value.finance, draft.id);
  const version = (
    value.sqlite.prepare('SELECT version FROM invoice WHERE id=?').get(draft.id) as {
      version: number;
    }
  ).version;
  return { rate, time, rule, draft, version };
}

describe('project calculation reconciliation', () => {
  it('distinguishes empty hourly periods from positive fixed-fee labor periods', () => {
    const hourly = fixture();
    bindCanonicalAuthority(hourly, true);
    const hourlyRule = hourly.sqlite
      .prepare("SELECT id FROM billing_rule WHERE project_id=? AND stream_type='labor'")
      .get(hourly.project.id) as { id: string };
    expect(
      hourly.repository.billingReadiness(hourly.finance, hourlyRule.id, '2026-09-25', '2026-09-25'),
    ).toMatchObject({
      state: 'ready',
      includedSourceCount: 0,
      hasPositiveFixedFee: false,
      hasPositiveDraftAmount: false,
    });
    expect(() =>
      hourly.repository.createInvoiceDraft(
        hourly.finance,
        hourlyRule.id,
        '2026-09-25',
        '2026-09-25',
      ),
    ).toThrow(ReadinessError);

    const fixed = fixture();
    fixed.repository.updateProject(fixed.owner, {
      projectId: fixed.project.id,
      billingModel: 'all_in',
      fixedPriceMinor: 25_000n,
    });
    bindCanonicalAuthority(fixed, true);
    const fixedRule = fixed.sqlite
      .prepare("SELECT id FROM billing_rule WHERE project_id=? AND stream_type='labor'")
      .get(fixed.project.id) as { id: string };
    expect(
      fixed.repository.billingReadiness(fixed.finance, fixedRule.id, '2026-09-25', '2026-09-25'),
    ).toMatchObject({
      state: 'ready',
      includedSourceCount: 0,
      hasPositiveFixedFee: true,
      hasPositiveDraftAmount: true,
    });
    const fixedDraft = fixed.repository.createInvoiceDraft(
      fixed.finance,
      fixedRule.id,
      '2026-09-25',
      '2026-09-25',
    );
    expect(
      fixed.sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(fixedDraft.id),
    ).toEqual({ subtotal_minor: 25_000 });

    const hybrid = fixture();
    hybrid.repository.updateProject(hybrid.owner, {
      projectId: hybrid.project.id,
      billingModel: 'hybrid',
    });
    bindCanonicalAuthority(hybrid, true, 5_000n);
    const hybridRule = hybrid.sqlite
      .prepare("SELECT id FROM billing_rule WHERE project_id=? AND stream_type='labor'")
      .get(hybrid.project.id) as { id: string };
    expect(
      hybrid.repository.billingReadiness(hybrid.finance, hybridRule.id, '2026-09-25', '2026-09-25'),
    ).toMatchObject({
      state: 'ready',
      includedSourceCount: 0,
      hasPositiveFixedFee: true,
      hasPositiveDraftAmount: true,
    });
    const hybridDraft = hybrid.repository.createInvoiceDraft(
      hybrid.finance,
      hybridRule.id,
      '2026-09-25',
      '2026-09-25',
    );
    expect(
      hybrid.sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(hybridDraft.id),
    ).toEqual({ subtotal_minor: 5_000 });
  });

  it('blocks a zero-value refresh of an existing draft without mutating its prior snapshot', () => {
    const value = fixture();
    value.repository.updateProject(value.owner, {
      projectId: value.project.id,
      billingModel: 'all_in',
      fixedPriceMinor: 2_500n,
    });
    bindCanonicalAuthority(value, true);
    const rule = value.sqlite
      .prepare("SELECT id FROM billing_rule WHERE project_id=? AND stream_type='labor'")
      .get(value.project.id) as { id: string };
    const draft = value.repository.createInvoiceDraft(
      value.finance,
      rule.id,
      '2026-09-25',
      '2026-09-25',
    );
    value.sqlite.prepare('UPDATE project SET fixed_price_minor=0 WHERE id=?').run(value.project.id);
    expect(
      value.repository.billingReadiness(value.finance, rule.id, '2026-09-25', '2026-09-25'),
    ).toMatchObject({
      state: 'ready',
      existingInvoiceId: draft.id,
      existingInvoiceState: 'draft',
      includedSourceCount: 0,
      hasPositiveDraftAmount: false,
    });
    expect(() =>
      value.repository.createInvoiceDraft(value.finance, rule.id, '2026-09-25', '2026-09-25'),
    ).toThrow(ReadinessError);
    expect(
      value.sqlite.prepare('SELECT subtotal_minor,state FROM invoice WHERE id=?').get(draft.id),
    ).toEqual({ subtotal_minor: 2_500, state: 'draft' });
  });

  it('treats included hybrid minutes and rounded-zero labor as zero-value', () => {
    for (const scenario of ['hybrid', 'rounded'] as const) {
      const value = fixture();
      if (scenario === 'hybrid')
        value.repository.updateProject(value.owner, {
          projectId: value.project.id,
          billingModel: 'hybrid',
        });
      bindCanonicalAuthority(value, true, scenario === 'hybrid' ? 0n : undefined);
      const rule = value.sqlite
        .prepare("SELECT id FROM billing_rule WHERE project_id=? AND stream_type='labor'")
        .get(value.project.id) as { id: string };
      if (scenario === 'hybrid')
        value.sqlite
          .prepare('UPDATE billing_rule SET included_minutes=480 WHERE id=?')
          .run(rule.id);
      value.v3.createClientLaborRate(value.finance, {
        projectId: value.project.id,
        workerId: value.worker.userId,
        currency: 'EUR',
        hourlyRateMinor: scenario === 'hybrid' ? 5_500n : 1n,
        effectiveFrom: '2026-08-01',
      });
      const time = value.repository.createTimeEntry(value.worker, {
        projectId: value.project.id,
        workDate: '2026-09-25',
        category: 'regular',
        minutes: scenario === 'hybrid' ? 60 : 1,
        summary: `${scenario} zero-value test`,
      });
      value.repository.submitTime(value.worker, time.id, time.version);
      value.repository.operationalApproveTime(value.manager, time.id, 'approved');
      value.repository.financeApproveTime(value.finance, time.id, true);
      expect(
        value.repository.billingReadiness(value.finance, rule.id, '2026-09-25', '2026-09-25'),
      ).toMatchObject({
        state: 'ready',
        includedSourceCount: 1,
        hasPositiveDraftAmount: false,
      });
      expect(() =>
        value.repository.createInvoiceDraft(value.finance, rule.id, '2026-09-25', '2026-09-25'),
      ).toThrow(ReadinessError);
    }
  });

  it('recognizes an approved positive milestone as a billable source', () => {
    const value = fixture();
    bindCanonicalAuthority(value, true);
    const authority = value.sqlite
      .prepare(
        "SELECT legal_entity_id,tax_profile_id FROM billing_rule WHERE project_id=? AND stream_type='labor'",
      )
      .get(value.project.id) as { legal_entity_id: string; tax_profile_id: string };
    const rule = value.repository.createBillingRule(value.finance, {
      projectId: value.project.id,
      legalEntityId: authority.legal_entity_id,
      streamType: 'milestone',
      cadenceType: 'custom',
      taxProfileId: authority.tax_profile_id,
      currency: 'EUR',
      effectiveFrom: '2026-08-01',
    });
    const milestone = value.repository.createProjectMilestone(value.owner, {
      projectId: value.project.id,
      name: 'Milestone readiness regression',
      amountMinor: 3_200n,
      dueOn: '2026-09-25',
    });
    value.repository.submitProjectMilestone(value.owner, milestone.id, milestone.version);
    value.repository.reviewProjectMilestone(value.manager, milestone.id, 'approved');
    expect(
      value.repository.billingReadiness(value.finance, rule.id, '2026-09-25', '2026-09-25'),
    ).toMatchObject({
      state: 'ready',
      streamType: 'milestone',
      includedSourceCount: 1,
      hasPositiveDraftAmount: true,
    });
    expect(
      value.repository.createInvoiceDraft(value.finance, rule.id, '2026-09-25', '2026-09-25'),
    ).toMatchObject({ created: true });
  });

  it('allows a hybrid expense stream to bill its fixed amount without expense rows', () => {
    const value = fixture();
    value.repository.updateProject(value.owner, {
      projectId: value.project.id,
      billingModel: 'hybrid',
    });
    bindCanonicalAuthority(value);
    const rule = value.sqlite
      .prepare("SELECT id FROM billing_rule WHERE project_id=? AND stream_type='expense'")
      .get(value.project.id) as { id: string };
    value.sqlite.prepare('UPDATE billing_rule SET fixed_amount_minor=1800 WHERE id=?').run(rule.id);
    expect(
      value.repository.billingReadiness(value.finance, rule.id, '2026-09-25', '2026-09-25'),
    ).toMatchObject({
      state: 'ready',
      streamType: 'expense',
      includedSourceCount: 0,
      hasPositiveFixedFee: true,
      hasPositiveDraftAmount: true,
    });
    const invoice = value.repository.createInvoiceDraft(
      value.finance,
      rule.id,
      '2026-09-25',
      '2026-09-25',
    );
    expect(
      value.sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(invoice.id),
    ).toEqual({ subtotal_minor: 1800 });
  });

  it('allows refreshing the draft that occupies its own cap but closes another period', () => {
    const value = fixture();
    value.repository.updateProject(value.owner, {
      projectId: value.project.id,
      billingModel: 'capped_tm',
      poCapMinor: 5_500n,
    });
    bindCanonicalAuthority(value, true);
    value.v3.createClientLaborRate(value.finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 5_500n,
      effectiveFrom: '2026-08-01',
    });
    const time = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-09-25',
      category: 'regular',
      minutes: 60,
      summary: 'At-cap draft refresh',
    });
    value.repository.submitTime(value.worker, time.id, time.version);
    value.repository.operationalApproveTime(value.manager, time.id, 'approved');
    value.repository.financeApproveTime(value.finance, time.id, true);
    const rule = value.sqlite
      .prepare("SELECT id FROM billing_rule WHERE project_id=? AND stream_type='labor'")
      .get(value.project.id) as { id: string };
    const draft = value.repository.createInvoiceDraft(
      value.finance,
      rule.id,
      '2026-09-25',
      '2026-09-25',
    );
    expect(
      value.repository.billingReadiness(value.finance, rule.id, '2026-09-25', '2026-09-25'),
    ).toMatchObject({
      state: 'ready',
      existingInvoiceId: draft.id,
      hasPositiveDraftAmount: true,
    });
    expect(
      value.repository.createInvoiceDraft(value.finance, rule.id, '2026-09-25', '2026-09-25'),
    ).toMatchObject({ refreshed: true });
    expect(
      value.repository.billingReadiness(value.finance, rule.id, '2026-09-26', '2026-09-26'),
    ).toMatchObject({
      state: 'incomplete',
      reasons: expect.arrayContaining([{ code: 'cap_exhausted' }]),
    });
  });

  it('keeps a prior-period approval issuable when a successor only closes its rule', () => {
    const value = fixture();
    const { rule, draft } = approvedLaborInvoice(value, true);
    value.repository.createInvoiceNumberPolicy(value.owner, {
      legalEntityId: rule.legal_entity_id,
      prefix: 'RECON',
      digits: 6,
      effectiveFrom: '2026-01-01',
      accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    });
    value.repository.createBillingRule(value.finance, {
      projectId: value.project.id,
      legalEntityId: rule.legal_entity_id,
      streamType: 'labor',
      cadenceType: 'custom',
      taxProfileId: rule.tax_profile_id,
      currency: 'EUR',
      effectiveFrom: '2026-08-21',
    });
    expect(
      value.sqlite.prepare('SELECT effective_to FROM billing_rule WHERE id=?').get(rule.id),
    ).toEqual({ effective_to: '2026-08-20' });
    expect(value.repository.issueInvoice(value.finance, draft.id)).toMatchObject({ issued: true });
    expect(value.repository.issueInvoice(value.finance, draft.id)).toMatchObject({ issued: false });
  });

  it('audits approved invoice recalculation, retries safely and requires fresh approval', () => {
    const value = fixture();
    const { rate, time, rule, draft, version } = approvedLaborInvoice(value);
    value.sqlite
      .prepare(
        'UPDATE client_labor_rate SET hourly_rate_minor=hourly_rate_minor+100,version=version+1 WHERE id=?',
      )
      .run(rate.id);
    expect(() => value.repository.issueInvoice(value.finance, draft.id)).toThrow();
    expect(() =>
      value.repository.recalculateApprovedInvoice(
        value.worker,
        draft.id,
        version,
        'Correct changed rate',
      ),
    ).toThrow();
    expect(() =>
      value.repository.recalculateApprovedInvoice(
        value.finance,
        draft.id,
        version - 1,
        'Correct changed rate',
      ),
    ).toThrow();
    expect(() => value.repository.archiveBillingRule(value.finance, rule.id)).toThrow();
    expect(() => value.repository.archiveTaxProfile(value.finance, rule.tax_profile_id)).toThrow();
    expect(() => value.repository.archiveLegalEntity(value.owner, rule.legal_entity_id)).toThrow();
    expect(
      value.sqlite.prepare('SELECT state,version FROM invoice WHERE id=?').get(draft.id),
    ).toEqual({ state: 'approved', version });
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM invoice_source WHERE invoice_id=?')
        .get(draft.id),
    ).toEqual({ count: 1 });
    const rebuilt = value.repository.recalculateApprovedInvoice(
      value.finance,
      draft.id,
      version,
      'Correct changed rate',
    );
    expect(rebuilt.created).toBe(true);
    expect(rebuilt.id).not.toBe(draft.id);
    expect(
      value.repository.recalculateApprovedInvoice(
        value.finance,
        draft.id,
        version,
        'Correct changed rate',
      ),
    ).toEqual({ id: rebuilt.id, created: false });
    expect(
      value.sqlite.prepare('SELECT state,subtotal_minor FROM invoice WHERE id=?').get(rebuilt.id),
    ).toMatchObject({ state: 'draft', subtotal_minor: 44_800 });
    expect(
      value.sqlite
        .prepare('SELECT state,subtotal_minor,snapshot_json FROM invoice WHERE id=?')
        .get(draft.id),
    ).toMatchObject({
      state: 'superseded',
      subtotal_minor: 44_000,
      snapshot_json: expect.any(String),
    });
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM invoice_line WHERE invoice_id=?')
        .get(draft.id),
    ).toEqual({ count: 1 });
    expect(
      value.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM audit_event WHERE action='invoice.approve' AND entity_id=?",
        )
        .get(draft.id),
    ).toEqual({ count: 1 });
    const history = value.sqlite
      .prepare(
        'SELECT replacement_invoice_id,prior_approval_version,source_links_json,reason FROM invoice_approved_supersession WHERE prior_invoice_id=?',
      )
      .get(draft.id) as {
      replacement_invoice_id: string;
      prior_approval_version: number;
      source_links_json: string;
      reason: string;
    };
    expect(history).toMatchObject({
      replacement_invoice_id: rebuilt.id,
      prior_approval_version: version,
      reason: 'Correct changed rate',
    });
    expect(JSON.parse(history.source_links_json)).toEqual([
      expect.objectContaining({ invoice_id: draft.id, source_type: 'time', source_id: time.id }),
    ]);
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM invoice_commercial_source_manifest WHERE invoice_id=?')
        .get(draft.id),
    ).toEqual({ count: 1 });
    expect(() =>
      value.sqlite
        .prepare('UPDATE invoice_approved_supersession SET reason=? WHERE prior_invoice_id=?')
        .run('rewrite', draft.id),
    ).toThrow();
    expect(() =>
      value.sqlite.prepare("UPDATE invoice SET state='draft' WHERE id=?").run(draft.id),
    ).toThrow();
    expect(() =>
      value.sqlite.prepare('DELETE FROM invoice_line WHERE invoice_id=?').run(draft.id),
    ).toThrow();
    expect(() =>
      value.repository.deleteInvoice(
        value.owner,
        draft.id,
        'Remove superseded invoice',
        version + 1,
      ),
    ).toThrow();
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM invoice_source WHERE source_type=? AND source_id=?')
        .get('time', time.id),
    ).toEqual({ count: 1 });
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM invoice_source WHERE invoice_id=?')
        .get(draft.id),
    ).toEqual({ count: 0 });
    const audit = value.sqlite
      .prepare(
        "SELECT details_json FROM audit_event WHERE action='invoice.draft_create' AND entity_id=? ORDER BY occurred_at DESC,id DESC LIMIT 1",
      )
      .get(rebuilt.id) as { details_json: string };
    expect(JSON.parse(audit.details_json)).toMatchObject({
      recalculatedFromInvoiceId: draft.id,
      recalculatedFromVersion: version,
      reason: 'Correct changed rate',
    });
    value.repository.approveInvoiceDraft(value.finance, rebuilt.id);

    // Pre-provenance approved records may exist after an upgrade. They cannot
    // issue until this same explicit, reasoned recalculation is approved.
    value.sqlite.prepare('UPDATE invoice SET snapshot_json=NULL WHERE id=?').run(rebuilt.id);
    expect(() => value.repository.issueInvoice(value.finance, rebuilt.id)).toThrow();
    const legacyVersion = (
      value.sqlite.prepare('SELECT version FROM invoice WHERE id=?').get(rebuilt.id) as {
        version: number;
      }
    ).version;
    const repaired = value.repository.recalculateApprovedInvoice(
      value.finance,
      rebuilt.id,
      legacyVersion,
      'Rebuild legacy snapshot',
    );
    expect(repaired.id).not.toBe(rebuilt.id);
    expect(
      value.sqlite.prepare('SELECT state,subtotal_minor FROM invoice WHERE id=?').get(repaired.id),
    ).toMatchObject({ state: 'draft', subtotal_minor: 44_800 });
    expect(() => value.repository.issueInvoice(value.finance, repaired.id)).toThrow();
    value.sqlite
      .prepare(
        'UPDATE client_labor_rate SET hourly_rate_minor=hourly_rate_minor+100,version=version+1 WHERE id=?',
      )
      .run(rate.id);
    const refreshedReplacement = value.repository.createInvoiceDraft(
      value.finance,
      rule.id,
      '2026-08-20',
      '2026-08-20',
    );
    expect(refreshedReplacement).toMatchObject({
      id: repaired.id,
      created: false,
      refreshed: true,
    });
    expect(
      value.sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(repaired.id),
    ).toEqual({ subtotal_minor: 45_600 });
    expect(
      value.sqlite
        .prepare(
          'SELECT replacement_invoice_id FROM invoice_approved_supersession WHERE prior_invoice_id=?',
        )
        .get(rebuilt.id),
    ).toEqual({ replacement_invoice_id: repaired.id });
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM invoice_source WHERE source_type=? AND source_id=?')
        .get('time', time.id),
    ).toEqual({ count: 1 });
    value.repository.approveInvoiceDraft(value.finance, repaired.id);
    expect(value.sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(repaired.id)).toEqual({
      state: 'approved',
    });
  });

  it('enforces effective windows across combined and separate billing mode changes', () => {
    const value = fixture();
    bindCanonicalAuthority(value, true);
    const original = value.sqlite
      .prepare(
        "SELECT id,legal_entity_id,tax_profile_id FROM billing_rule WHERE project_id=? AND stream_type='labor'",
      )
      .get(value.project.id) as { id: string; legal_entity_id: string; tax_profile_id: string };
    const ruleInput = {
      projectId: value.project.id,
      legalEntityId: original.legal_entity_id,
      cadenceType: 'custom' as const,
      taxProfileId: original.tax_profile_id,
      currency: 'EUR' as const,
    };

    const separateLabor = value.repository.createBillingRule(value.finance, {
      ...ruleInput,
      streamType: 'labor',
      effectiveFrom: '2026-08-16',
    });
    const separateExpense = value.repository.createBillingRule(value.finance, {
      ...ruleInput,
      streamType: 'expense',
      effectiveFrom: '2026-08-16',
    });
    expect(() =>
      value.repository.updateBillingRule(value.finance, separateLabor.id, {
        includeExpenses: true,
      }),
    ).toThrow(/cannot overlap/u);
    expect(() =>
      value.repository.createBillingRule(value.finance, {
        ...ruleInput,
        streamType: 'labor',
        includeExpenses: true,
        effectiveFrom: '2026-08-20',
      }),
    ).toThrow(/cannot overlap/u);

    const beyondWindow = (ruleId: string, start: string, end: string) => {
      expect(value.repository.billingReadiness(value.finance, ruleId, start, end)).toMatchObject({
        state: 'incomplete',
        reasons: expect.arrayContaining([
          expect.objectContaining({ code: 'billing_rule_outside_effective_window' }),
        ]),
      });
      expect(() =>
        value.repository.createInvoiceDraft(value.finance, ruleId, start, end),
      ).toThrow();
    };
    beyondWindow(original.id, '2026-08-15', '2026-08-16');
    beyondWindow(separateLabor.id, '2026-08-15', '2026-08-16');
    beyondWindow(separateExpense.id, '2026-08-15', '2026-08-16');
    for (const [ruleId, onDate] of [
      [original.id, '2026-08-15'],
      [separateLabor.id, '2026-08-16'],
      [separateExpense.id, '2026-08-16'],
    ] as const) {
      expect(
        value.repository.billingReadiness(value.finance, ruleId, onDate, onDate).reasons,
      ).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'billing_rule_outside_effective_window' }),
        ]),
      );
    }

    value.sqlite
      .prepare('UPDATE billing_rule SET effective_to=? WHERE id=?')
      .run('2026-08-25', separateExpense.id);
    const laterCombined = value.repository.createBillingRule(value.finance, {
      ...ruleInput,
      streamType: 'labor',
      includeExpenses: true,
      effectiveFrom: '2026-08-26',
    });
    beyondWindow(separateLabor.id, '2026-08-25', '2026-08-26');
    beyondWindow(separateExpense.id, '2026-08-25', '2026-08-26');
    beyondWindow(laterCombined.id, '2026-08-25', '2026-08-26');
    expect(
      value.repository.billingReadiness(value.finance, laterCombined.id, '2026-08-26', '2026-08-26')
        .reasons,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'billing_rule_outside_effective_window' }),
        expect.objectContaining({ code: 'conflicting_billing_modes' }),
      ]),
    );
  });

  it('creates one exact mixed-rate time-and-expense draft and reserves every source once', () => {
    const value = fixture();
    bindCanonicalAuthority(value, true);
    const workDate = '2026-08-20';
    const timeIds: string[] = [];
    for (const [index, worker] of value.workers.entries()) {
      value.v3.createClientLaborRate(value.finance, {
        projectId: value.project.id,
        workerId: worker.userId,
        currency: 'EUR',
        hourlyRateMinor: index === 7 ? 7_000n : 5_500n,
        effectiveFrom: '2026-08-01',
      });
      const entry = value.repository.createTimeEntry(worker, {
        projectId: value.project.id,
        workDate,
        category: 'regular',
        minutes: 480,
        summary: `Combined billing work ${index + 1}`,
      });
      value.repository.submitTime(worker, entry.id, entry.version);
      value.repository.operationalApproveTime(value.manager, entry.id, 'approved');
      value.repository.financeApproveTime(value.finance, entry.id, true);
      timeIds.push(entry.id);
    }
    value.policy.create(value.finance, {
      projectMemberId: value.memberId(value.workers[0]!.userId),
      payer: 'worker',
      category: 'hotel',
      effectiveFrom: '2026-08-01',
      workerReimbursement: 'at_cost',
      clientRecovery: 'at_cost',
      reason: 'Recover one lodging expense in the combined invoice',
    });
    const expenseId = addApprovedExpense(value, {
      worker: value.workers[0]!,
      amountMinor: 4_000n,
      payer: 'worker',
      category: 'hotel',
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      key: 'combined-recoverable',
    });
    const rule = value.sqlite
      .prepare(
        "SELECT id,include_expenses FROM billing_rule WHERE project_id=? AND stream_type='labor'",
      )
      .get(value.project.id) as { id: string; include_expenses: number };
    expect(rule.include_expenses).toBe(1);
    expect(value.repository.listBillingRules(value.finance)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: rule.id, include_expenses: 1 })]),
    );
    expect(
      value.repository.billingReadiness(value.finance, rule.id, workDate, workDate),
    ).toMatchObject({ state: 'ready', includedSourceCount: 9 });
    const draft = value.repository.createInvoiceDraft(value.finance, rule.id, workDate, workDate);
    const preview = value.repository.invoicePreview(value.finance, draft.id);
    expect(preview.invoice).toMatchObject({
      stream_type: 'labor',
      subtotal_minor: 368_000,
      total_minor: 368_000,
      labor_subtotal_minor: '364000',
      expense_subtotal_minor: '4000',
      has_expense_lines: true,
    });
    expect(preview.lines).toHaveLength(9);
    expect(
      preview.lines.filter((line) => (line as { source_type: string }).source_type === 'expense'),
    ).toHaveLength(1);
    expect(
      value.sqlite
        .prepare(
          'SELECT source_type,source_id FROM invoice_source WHERE invoice_id=? ORDER BY source_type,source_id',
        )
        .all(draft.id),
    ).toEqual([
      { source_type: 'expense', source_id: expenseId },
      ...timeIds.sort().map((source_id) => ({ source_type: 'time', source_id })),
    ]);
    const retry = value.repository.createInvoiceDraft(value.finance, rule.id, workDate, workDate);
    expect(retry).toMatchObject({ created: false, refreshed: true });
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM invoice WHERE project_id=?')
        .get(value.project.id),
    ).toEqual({ count: 1 });
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM invoice_source WHERE invoice_id=?')
        .get(retry.id),
    ).toEqual({ count: 9 });
    const draftProvenance = JSON.parse(
      (
        value.sqlite.prepare('SELECT snapshot_json FROM invoice WHERE id=?').get(retry.id) as {
          snapshot_json: string;
        }
      ).snapshot_json,
    ) as {
      billingCalculationFingerprint: string;
      calculationSelections: Array<{ kind: string; rateRule?: { id: string; version: number } }>;
    };
    expect(draftProvenance.billingCalculationFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    const selectedRate = draftProvenance.calculationSelections.find(
      (selection) => selection.kind === 'client_labor',
    )?.rateRule;
    expect(selectedRate).toMatchObject({ id: expect.any(String), version: 1 });
    value.sqlite
      .prepare(
        'UPDATE client_labor_rate SET hourly_rate_minor=hourly_rate_minor+100,version=version+1 WHERE id=?',
      )
      .run(selectedRate!.id);
    expect(() => value.repository.approveInvoiceDraft(value.finance, retry.id)).toThrow();
    let currentDraft = value.repository.createInvoiceDraft(
      value.finance,
      rule.id,
      workDate,
      workDate,
    );
    expect(
      (
        value.sqlite
          .prepare('SELECT subtotal_minor FROM invoice WHERE id=?')
          .get(currentDraft.id) as { subtotal_minor: number }
      ).subtotal_minor,
    ).toBe(368_800);
    for (const malformed of [null, '{', '{"billingRuleVersion":1}']) {
      value.sqlite
        .prepare('UPDATE invoice SET snapshot_json=? WHERE id=?')
        .run(malformed, currentDraft.id);
      expect(() => value.repository.approveInvoiceDraft(value.finance, currentDraft.id)).toThrow();
      currentDraft = value.repository.createInvoiceDraft(
        value.finance,
        rule.id,
        workDate,
        workDate,
      );
    }
    const billing = value.sqlite
      .prepare('SELECT legal_entity_id,tax_profile_id FROM billing_rule WHERE id=?')
      .get(rule.id) as { legal_entity_id: string; tax_profile_id: string };
    const expenseRuleInput = {
      projectId: value.project.id,
      legalEntityId: billing.legal_entity_id,
      streamType: 'expense' as const,
      cadenceType: 'custom' as const,
      taxProfileId: billing.tax_profile_id,
      currency: 'EUR' as const,
      effectiveFrom: '2026-08-01',
    };
    expect(() => value.repository.createBillingRule(value.finance, expenseRuleInput)).toThrow(
      /cannot overlap/u,
    );
    value.repository.updateBillingRule(value.finance, rule.id, { includeExpenses: false });
    const overlappingExpenseRule = value.repository.createBillingRule(
      value.finance,
      expenseRuleInput,
    );
    expect(
      value.repository.billingReadiness(
        value.finance,
        overlappingExpenseRule.id,
        workDate,
        workDate,
      ),
    ).toMatchObject({
      state: 'incomplete',
      reasons: expect.arrayContaining([
        expect.objectContaining({ code: 'source_already_reserved', sourceId: expenseId }),
      ]),
    });
    expect(() =>
      value.repository.createInvoiceDraft(
        value.finance,
        overlappingExpenseRule.id,
        workDate,
        workDate,
      ),
    ).toThrow();
    // A pre-upgrade database can still contain an overlap. Readiness must
    // identify it deterministically without rewriting historical rows.
    value.sqlite.prepare('UPDATE billing_rule SET include_expenses=1 WHERE id=?').run(rule.id);
    expect(
      value.repository.billingReadiness(value.finance, rule.id, workDate, workDate),
    ).toMatchObject({
      state: 'incomplete',
      reasons: expect.arrayContaining([
        expect.objectContaining({ code: 'conflicting_billing_modes' }),
      ]),
    });
    value.sqlite.prepare('UPDATE billing_rule SET include_expenses=0 WHERE id=?').run(rule.id);
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM invoice WHERE project_id=?')
        .get(value.project.id),
    ).toEqual({ count: 1 });
    expect(() => value.repository.approveInvoiceDraft(value.finance, currentDraft.id)).toThrow();
    expect(
      value.sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(currentDraft.id),
    ).toEqual({
      state: 'draft',
    });
    value.repository.archiveBillingRule(value.finance, overlappingExpenseRule.id);
    value.repository.updateBillingRule(value.finance, rule.id, { includeExpenses: true });
    const refreshed = value.repository.createInvoiceDraft(
      value.finance,
      rule.id,
      workDate,
      workDate,
    );
    value.repository.approveInvoiceDraft(value.finance, refreshed.id);
    value.sqlite
      .prepare(
        'UPDATE client_labor_rate SET hourly_rate_minor=hourly_rate_minor+100,version=version+1 WHERE id=?',
      )
      .run(selectedRate!.id);
    expect(() => value.repository.issueInvoice(value.finance, refreshed.id)).toThrow();
    value.repository.updateBillingRule(value.finance, rule.id, { groupingMode: 'detail' });
    expect(() => value.repository.issueInvoice(value.finance, refreshed.id)).toThrow();
    expect(value.sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(refreshed.id)).toEqual({
      state: 'approved',
    });
  });

  it('reconciles eight independent labor rates, worker pay, expense policies and invoice streams', () => {
    const value = fixture();
    bindCanonicalAuthority(value);
    const workDate = '2026-08-20';
    const timeIds: string[] = [];

    for (const [index, worker] of value.workers.entries()) {
      const clientRateMinor = index === 7 ? 7_000n : 5_500n;
      const workerRateMinor = index === 7 ? 4_500n : 3_000n;
      value.v3.createClientLaborRate(value.finance, {
        projectId: value.project.id,
        workerId: worker.userId,
        currency: 'EUR',
        hourlyRateMinor: clientRateMinor,
        effectiveFrom: '2026-08-01',
      });
      value.v3.createCompensationRule(value.finance, {
        workerId: worker.userId,
        projectId: value.project.id,
        currency: 'EUR',
        ruleType: 'Hourly',
        rateMinor: workerRateMinor,
        effectiveFrom: '2026-08-01',
      });
      value.v3.createInternalCostRule(value.finance, {
        workerId: worker.userId,
        projectId: value.project.id,
        currency: 'EUR',
        hourlyRateMinor: workerRateMinor,
        effectiveFrom: '2026-08-01',
      });
      const created = value.repository.createTimeEntry(worker, {
        projectId: value.project.id,
        workDate,
        category: 'regular',
        minutes: 480,
        summary: `Eight approved hours for worker ${index + 1}`,
      });
      value.repository.submitTime(worker, created.id, created.version);
      value.repository.operationalApproveTime(value.manager, created.id, 'approved');
      value.repository.financeApproveTime(value.finance, created.id, true);
      timeIds.push(created.id);
    }

    const firstWorker = value.workers[0]!;
    const lastWorker = value.workers[7]!;
    value.policy.create(value.finance, {
      projectMemberId: value.memberId(firstWorker.userId),
      payer: 'worker',
      category: 'hotel',
      effectiveFrom: '2026-08-01',
      workerReimbursement: 'at_cost',
      clientRecovery: 'at_cost',
      reason: 'Reimburse and recover first worker lodging',
    });
    value.policy.create(value.finance, {
      projectMemberId: value.memberId(lastWorker.userId),
      payer: 'worker',
      category: 'meals',
      effectiveFrom: '2026-08-01',
      workerReimbursement: 'none',
      clientRecovery: 'included',
      reason: 'Personal meal is informational and not reimbursed',
    });
    value.policy.create(value.finance, {
      projectMemberId: value.memberId(firstWorker.userId),
      payer: 'company_direct',
      category: 'hotel',
      effectiveFrom: '2026-08-01',
      workerReimbursement: 'none',
      clientRecovery: 'included',
      reason: 'Company pays included accommodation directly',
    });

    const recoverable = addApprovedExpense(value, {
      worker: firstWorker,
      amountMinor: 4_000n,
      payer: 'worker',
      category: 'hotel',
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      key: 'recoverable',
    });
    const informational = addApprovedExpense(value, {
      worker: lastWorker,
      amountMinor: 2_500n,
      payer: 'worker',
      category: 'meals',
      clientTreatment: 'all_in',
      billingTreatment: 'all_in',
      key: 'informational',
    });
    const companyPaid = addApprovedExpense(value, {
      worker: firstWorker,
      amountMinor: 6_000n,
      payer: 'company_direct',
      category: 'hotel',
      clientTreatment: 'all_in',
      billingTreatment: 'all_in',
      key: 'company-paid',
    });

    const finance = value.v3.projectFinance(value.finance, value.project.id, workDate, workDate);
    expect(finance).toMatchObject({
      state: 'ready',
      currency: 'EUR',
      actualMinutes: 3_840,
      approvedMinutes: 3_840,
      billableMinutes: 3_840,
      laborRevenueMinor: '364000',
      expenseRevenueMinor: '4000',
      workerCompensationMinor: '204000',
      directLaborCostMinor: '204000',
      approvedCostMinor: '214000',
      revenueCandidateMinor: '368000',
      contributionMarginMinor: '154000',
      approvedUnbilledWipMinor: '368000',
      approvedUnbilledWipReconciles: true,
    });
    expect(finance.reasons).toEqual([]);
    expect(finance.timeEconomics).toHaveLength(8);
    expect(finance.expenseEconomics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: recoverable, costMinor: '4000', revenueMinor: '4000' }),
        expect.objectContaining({ id: informational, costMinor: '0', revenueMinor: '0' }),
        expect.objectContaining({ id: companyPaid, costMinor: '6000', revenueMinor: '0' }),
      ]),
    );
    const sourceAmounts = finance.approvedUnbilledSources.reduce(
      (sum, source) => sum + BigInt(String(source.amountMinor)),
      0n,
    );
    expect(sourceAmounts).toBe(368_000n);
    expect(finance.approvedUnbilledSources.map((source) => source.sourceId)).toEqual(
      expect.arrayContaining([...timeIds, recoverable]),
    );
    expect(
      finance.approvedUnbilledSources.some((source) => source.sourceId === informational),
    ).toBe(false);
    expect(finance.approvedUnbilledSources.some((source) => source.sourceId === companyPaid)).toBe(
      false,
    );

    const pay = value.workers.map((worker) => value.v3.workerPay(worker, workDate, workDate));
    expect(pay.reduce((sum, row) => sum + BigInt(row.estimatedApprovedMinor), 0n)).toBe(204_000n);
    expect(pay.reduce((sum, row) => sum + BigInt(row.approvedReimbursementMinor), 0n)).toBe(4_000n);
    expect(pay[0]).toMatchObject({
      approvedMinutes: 480,
      estimatedApprovedMinor: '24000',
      approvedReimbursementMinor: '4000',
    });
    expect(pay[7]).toMatchObject({
      approvedMinutes: 480,
      estimatedApprovedMinor: '36000',
      approvedReimbursementMinor: '0',
    });

    const billingRules = value.sqlite
      .prepare(
        'SELECT id,stream_type,include_expenses FROM billing_rule WHERE project_id=? ORDER BY stream_type',
      )
      .all(value.project.id) as Array<{
      id: string;
      stream_type: string;
      include_expenses: number;
    }>;
    expect(billingRules.map((row) => row.stream_type)).toEqual(['expense', 'labor']);
    expect(billingRules.map((row) => row.include_expenses)).toEqual([0, 0]);
    const drafts = billingRules.map((rule) => ({
      stream: rule.stream_type,
      draft: value.repository.createInvoiceDraft(value.finance, rule.id, workDate, workDate),
    }));
    const draftAmounts = drafts.map(({ stream, draft }) => ({
      stream,
      ...(value.sqlite
        .prepare('SELECT subtotal_minor,total_minor FROM invoice WHERE id=?')
        .get(draft.id) as { subtotal_minor: number; total_minor: number }),
    }));
    expect(draftAmounts).toEqual([
      { stream: 'expense', subtotal_minor: 4_000, total_minor: 4_000 },
      { stream: 'labor', subtotal_minor: 364_000, total_minor: 364_000 },
    ]);
    expect(draftAmounts.reduce((sum, row) => sum + BigInt(row.total_minor), 0n)).toBe(368_000n);
    const linkedSources = drafts.flatMap(
      ({ draft }) =>
        value.sqlite
          .prepare('SELECT source_type,source_id FROM invoice_source WHERE invoice_id=?')
          .all(draft.id) as Array<{ source_type: string; source_id: string }>,
    );
    expect(linkedSources.filter((source) => source.source_type === 'time')).toHaveLength(8);
    expect(linkedSources.filter((source) => source.source_type === 'expense')).toEqual([
      { source_type: 'expense', source_id: recoverable },
    ]);
  });
});
