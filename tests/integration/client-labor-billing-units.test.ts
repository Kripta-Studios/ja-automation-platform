import { afterEach, describe, expect, it } from 'vitest';
import {
  V3AccessDeniedError,
  ProjectBillingSetupRepository,
  AssignmentExpensePolicyRepository,
} from '@ja/database';
import { draftInvoiceTemplateSnapshot } from '../../apps/portal/src/lib/server/invoice-draft-preview.ts';
import { renderInvoiceTemplate } from '../../packages/invoice-templates/src/index.ts';
import {
  resolveInvoiceIssuerAuthority,
  invoiceIssuerCoverageIssue,
} from '../../packages/database/src/domains/billing/issuer-document-settings.ts';
import { ClientLaborChargeAllocator } from '../../packages/database/src/domains/commercial/client-labor-charge.ts';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) closeB5LifecycleSecurityFixture(f);
});
function setup(unit: 'hourly' | 'daily' | 'weekly', amount = 60000n) {
  const base = createB5LifecycleSecurityFixture();
  fixtures.push(base);
  const f = {
    ...base,
    owner: stepUpB5Principal(base.sqlite, base.owner, 'units-owner'),
    finance: stepUpB5Principal(base.sqlite, base.finance, 'units-finance'),
    worker: stepUpB5Principal(base.sqlite, base.worker, 'units-worker'),
    manager: stepUpB5Principal(base.sqlite, base.manager, 'units-manager'),
  };
  const rate = f.v3.createClientLaborRate(f.finance, {
    projectId: f.project.id,
    workerId: f.worker.userId,
    currency: 'EUR',
    hourlyRateMinor: unit === 'hourly' ? amount : 0n,
    unitRateMinor: unit === 'hourly' ? undefined : amount,
    rateBasis: unit,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  f.v3.createInternalCostRule(f.finance, {
    workerId: f.worker.userId,
    projectId: f.project.id,
    currency: 'EUR',
    hourlyRateMinor: 1500n,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  f.v3.createCompensationRule(f.finance, {
    workerId: f.worker.userId,
    projectId: f.project.id,
    currency: 'EUR',
    ruleType: 'Daily',
    rateMinor: 24000n,
    overtimeMethod: 'NONE',
    travelMethod: 'BASE',
    effectiveFrom: '2026-08-01',
  });
  const entity = f.repository.createLegalEntity(f.owner, {
    code: 'UNIT',
    legalName: 'Unit invoice issuer',
    currency: 'EUR',
    billingAddress: 'Test address',
    companyIdentifiers: 'UNIT-TEST',
  });
  const revision = f.v3.createCanonicalLegalEntityRevision(f.finance, {
    legacyLegalEntityId: entity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Unit invoice issuer',
    taxIdentifier: 'UNIT-TEST',
    addressLine1: 'Test address',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR',
    timezone: 'Europe/Madrid',
    reason: 'Test unit invoice authority',
    idempotencyKey: 'unit-revision',
  });
  const assign = (from: string, to?: string) =>
    f.v3.assignCanonicalLegalEntityToProject(f.finance, {
      projectId: f.project.id,
      legalEntityRevisionId: revision.revisionId,
      effectiveFrom: from,
      effectiveTo: to,
      reason: 'Test invoice assignment interval',
      idempotencyKey: `unit-assignment-${from}`,
    });
  const rule = f.repository.createBillingRule(f.finance, {
    projectId: f.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    currency: 'EUR',
    effectiveFrom: '2026-08-01',
  });
  const time = (
    date: string,
    minutes: number,
    category: 'regular' | 'travel' | 'overtime' = 'regular',
  ) => {
    const t = f.repository.createTimeEntry(f.worker, {
      projectId: f.project.id,
      workDate: date,
      minutes,
      category,
      summary: `Unit example ${date} ${minutes} ${category}`,
    });
    f.repository.submitTime(f.worker, t.id, t.version);
    f.repository.operationalApproveTime(f.manager, t.id, 'approved');
    f.repository.financeApproveTime(f.finance, t.id, true);
    return t;
  };
  const draft = (start: string, end: string) =>
    f.repository.createInvoiceDraft(f.finance, rule.id, start, end);
  const total = (id: string) =>
    f.sqlite.prepare('SELECT subtotal_minor amount FROM invoice WHERE id=?').get(id) as {
      amount: number;
    };
  return { ...f, rate, entity, revision, assign, time, draft, total };
}

describe('full worked customer billing units', () => {
  it('bills one full day for partial and split work, preserves pay and actual hours, and snapshots units in the PDF', () => {
    const f = setup('daily', 60001n);
    f.assign('2026-08-01');
    f.time('2026-08-03', 30);
    f.time('2026-08-03', 45, 'travel');
    f.time('2026-08-04', 15);
    const invoice = f.draft('2026-08-01', '2026-08-04');
    expect(f.total(invoice.id).amount).toBe(120002);
    const lines = f.sqlite
      .prepare('SELECT * FROM invoice_line WHERE invoice_id=? ORDER BY description')
      .all(invoice.id);
    expect(lines.map((l) => l.quantity_numerator).sort()).toEqual([0, 1, 1]);
    expect(
      f.sqlite
        .prepare('SELECT SUM(minutes) minutes FROM time_entry WHERE project_id=?')
        .get(f.project.id),
    ).toEqual({ minutes: 90 });
    const finance = f.v3.projectFinance(f.finance, f.project.id, '2026-08-01', '2026-08-04');
    expect(finance.laborRevenueMinor).toBe('120002');
    const pdf = renderInvoiceTemplate(
      draftInvoiceTemplateSnapshot(f.repository.invoicePreview(f.finance, invoice.id), 'es'),
    ).body;
    expect(pdf).toContain('día');
    expect(pdf).toContain('2.00 día');
    const retry = f.draft('2026-08-01', '2026-08-04');
    expect(f.total(retry.id).amount).toBe(120002);
    expect(
      f.sqlite.prepare('SELECT COUNT(*) count FROM invoice WHERE project_id=?').get(f.project.id),
    ).toEqual({ count: 1 });
    expect(
      f.sqlite
        .prepare('SELECT COUNT(*) count FROM invoice_source WHERE invoice_id=?')
        .get(retry.id),
    ).toEqual({ count: 3 });
    expect(() =>
      f.v3.resolveClientLaborRate(f.worker, f.project.id, f.worker.userId, 'regular', '2026-08-03'),
    ).toThrow(V3AccessDeniedError);
  });
  it('charges one Monday–Sunday week across separate invoice periods and late earlier parts, then another full next week', () => {
    const f = setup('weekly', 150000n);
    f.assign('2026-08-01');
    f.time('2026-08-05', 20);
    const first = f.draft('2026-08-05', '2026-08-05');
    expect(f.total(first.id).amount).toBe(150000);
    // A later approval on an earlier date must not replace the billed anchor.
    f.time('2026-08-03', 30);
    expect(() => f.draft('2026-08-03', '2026-08-04')).toThrow();
    expect(
      f.sqlite.prepare('SELECT COUNT(*) count FROM invoice WHERE project_id=?').get(f.project.id),
    ).toEqual({ count: 1 });
    f.time('2026-08-09', 60, 'overtime');
    expect(() => f.draft('2026-08-06', '2026-08-09')).toThrow();
    expect(
      f.sqlite
        .prepare(
          'SELECT COUNT(*) count FROM invoice_source WHERE source_id IN (SELECT id FROM time_entry WHERE work_date<>?)',
        )
        .get('2026-08-05'),
    ).toEqual({ count: 0 });
    f.time('2026-08-10', 10);
    const next = f.draft('2026-08-10', '2026-08-11');
    expect(f.total(next.id).amount).toBe(150000);
    expect(
      f.sqlite
        .prepare('SELECT SUM(subtotal_minor) amount FROM invoice WHERE project_id=?')
        .get(f.project.id),
    ).toEqual({ amount: 300000 });
  });
  it('does not charge unapproved, zero minute or nonbillable travel, and excludes hourly minimum top-ups for daily units', () => {
    const f = setup('daily');
    f.assign('2026-08-01');
    f.repository.createProjectCommercialPolicy(f.finance, {
      projectId: f.project.id,
      effectiveFrom: '2026-08-01',
      overtimeEnabled: true,
      overtimeThresholdMinutes: 30,
      travelClientBillable: false,
      customerSignoffRequired: false,
    });
    f.sqlite
      .prepare('UPDATE project SET client_daily_minimum_minutes=480 WHERE id=?')
      .run(f.project.id);
    const travel = f.time('2026-08-03', 10, 'travel');
    const work = f.time('2026-08-03', 90);
    const charge = new ClientLaborChargeAllocator(f.sqlite);
    expect(
      charge.charge({
        sourceId: travel.id,
        projectId: f.project.id,
        workerId: f.worker.userId,
        workDate: '2026-08-03',
        minutes: 0,
        currency: 'EUR',
        unit: 'daily',
        rateMinor: 60000n,
      }).amountMinor,
    ).toBe(0n);
    const invoice = f.draft('2026-08-03', '2026-08-03');
    expect(f.total(invoice.id).amount).toBe(60000);
    expect(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM invoice_line WHERE invoice_id=? AND source_type='billing_adjustment'",
        )
        .get(invoice.id),
    ).toEqual({ count: 0 });
    expect(
      f.sqlite
        .prepare("SELECT source_id FROM invoice_source WHERE invoice_id=? AND source_type='time'")
        .all(invoice.id),
    ).toEqual([{ source_id: work.id }]);
  });
  it('accepts contiguous authority assignments of the same revision, blocks a gap, and checks currency and issuer', () => {
    const f = setup('hourly', 8000n);
    f.assign('2026-08-01', '2026-08-02');
    f.assign('2026-08-03');
    f.time('2026-08-03', 60);
    const invoice = f.draft('2026-08-01', '2026-08-04');
    const preview = f.repository.invoicePreview(f.finance, invoice.id);
    expect(preview.invoice.canonical_assignment_matches).toBe(1);
    expect(() => draftInvoiceTemplateSnapshot(preview, 'es')).not.toThrow();
    expect(
      resolveInvoiceIssuerAuthority(
        f.sqlite,
        f.project.id,
        f.entity.id,
        'USD',
        '2026-08-01',
        '2026-08-04',
      ),
    ).toBeUndefined();
    expect(
      resolveInvoiceIssuerAuthority(
        f.sqlite,
        f.project.id,
        'different-issuer',
        'EUR',
        '2026-08-01',
        '2026-08-04',
      ),
    ).toBeUndefined();
    expect(
      resolveInvoiceIssuerAuthority(
        f.sqlite,
        f.project.id,
        f.entity.id,
        'EUR',
        '2026-07-31',
        '2026-08-04',
      ),
    ).toBeUndefined();
    const gap = f.repository.createProject(f.owner, {
      clientId: f.client.id,
      name: 'Issuer gap',
      costCenterCode: 'UNIT-GAP-2',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      startDate: '2026-08-01',
    });
    for (const [from, to] of [
      ['2026-08-01', '2026-08-02'],
      ['2026-08-04', undefined],
    ])
      f.v3.assignCanonicalLegalEntityToProject(f.finance, {
        projectId: gap.id,
        legalEntityRevisionId: f.revision.revisionId,
        effectiveFrom: from!,
        effectiveTo: to,
        reason: 'Test genuine uncovered day',
        idempotencyKey: `gap-${from}`,
      });
    expect(
      resolveInvoiceIssuerAuthority(
        f.sqlite,
        gap.id,
        f.entity.id,
        'EUR',
        '2026-08-01',
        '2026-08-04',
      ),
    ).toBeUndefined();
    expect(
      invoiceIssuerCoverageIssue(f.sqlite, gap.id, f.entity.id, 'EUR', '2026-08-01', '2026-08-04'),
    ).toEqual({ kind: 'gap', missingFrom: '2026-08-03', missingTo: '2026-08-03' });
  });
  it('allows a dated weekly agreement while a monthly expense draft exists, preserves earlier billed rates, and charges percentage pay once', () => {
    const f = setup('daily');
    f.assign('2026-08-01');
    f.time('2026-08-03', 60);
    const prior = f.draft('2026-08-01', '2026-08-04');
    const expenseRule = f.repository.createBillingRule(f.finance, {
      projectId: f.project.id,
      legalEntityId: f.entity.id,
      streamType: 'expense',
      cadenceType: 'monthly',
      currency: 'EUR',
      effectiveFrom: '2026-08-01',
    });
    f.sqlite
      .prepare(
        `INSERT INTO invoice(id,project_id,billing_rule_id,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,period_start,period_end,created_at,updated_at) VALUES(?,?,?,'expense','draft','EUR',0,0,0,'2026-08-01','2026-08-31',?,?)`,
      )
      .run(
        'monthly-expense-draft',
        f.project.id,
        expenseRule.id,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    const service = new ProjectBillingSetupRepository(f.sqlite, f.repository);
    const member = f.sqlite
      .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
      .get(f.project.id, f.worker.userId) as { id: string };
    service.savePersonTerms(f.finance, {
      projectId: f.project.id,
      projectMemberId: member.id,
      workerId: f.worker.userId,
      expectedFingerprint: service.personTermsFingerprint(f.finance, f.project.id, f.worker.userId),
      effectiveFrom: '2026-08-05',
      customerRateBasis: 'weekly',
      customerHourlyRate: '1500',
      internalCostHourlyRate: '15',
      workerPayType: 'PercentageOfEligibleClientLabor',
      workerPayAmount: '10',
      percentageBasis: 'CLIENT_LABOR_BEFORE_TAX',
      expensePayer: 'worker',
      workerReimbursement: 'at_cost',
      clientRecovery: 'at_cost',
      markupPercent: '',
    });
    expect(f.total(prior.id).amount).toBe(60000);
    f.time('2026-08-05', 30);
    f.time('2026-08-06', 45);
    const next = f.draft('2026-08-05', '2026-08-09');
    expect(f.total(next.id).amount).toBe(150000);
    const finance = f.v3.projectFinance(f.finance, f.project.id, '2026-08-05', '2026-08-09');
    expect(finance.workerCompensationMinor).toBe('15000');
    expect(finance.laborRevenueMinor).toBe('150000');
    const worker = f.v3.workerPay(f.worker, '2026-08-05', '2026-08-09');
    expect(JSON.stringify(worker)).not.toContain('150000');
    f.repository.approveInvoiceDraft(f.finance, next.id);
    expect(() =>
      service.savePersonTerms(f.finance, {
        projectId: f.project.id,
        projectMemberId: member.id,
        workerId: f.worker.userId,
        expectedFingerprint: service.personTermsFingerprint(
          f.finance,
          f.project.id,
          f.worker.userId,
        ),
        effectiveFrom: '2026-08-07',
        customerRateBasis: 'weekly',
        customerHourlyRate: '1600',
        workerPayType: 'PercentageOfEligibleClientLabor',
        workerPayAmount: '10',
        percentageBasis: 'CLIENT_LABOR_BEFORE_TAX',
        expensePayer: 'worker',
        workerReimbursement: 'at_cost',
        clientRecovery: 'at_cost',
        markupPercent: '',
      }),
    ).toThrow(/history overlaps/);
    expect(f.total(next.id).amount).toBe(150000);
  });
  it('round-trips a person daily override independently from project defaults and rejects hourly included-minute hybrid billing', () => {
    const f = setup('daily');
    f.assign('2026-08-01');
    const service = new ProjectBillingSetupRepository(f.sqlite, f.repository);
    expect(service.peopleReview(f.finance, f.project.id, '2026-08-03')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: f.worker.userId,
          customerRateBasis: 'daily',
          customerRateAmount: '600.00',
        }),
      ]),
    );
    const member = f.sqlite
      .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
      .get(f.project.id, f.worker.userId) as { id: string };
    new AssignmentExpensePolicyRepository(f.sqlite).create(f.finance, {
      projectMemberId: member.id,
      payer: 'company_card',
      effectiveFrom: '2026-08-01',
      workerReimbursement: 'none',
      clientRecovery: 'included',
      reason: 'Company paid expenses must not seed worker reimbursement',
    });
    expect(service.peopleReview(f.finance, f.project.id, '2026-08-03')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: f.worker.userId,
          expensePayer: 'company_card',
          workerReimbursement: 'none',
        }),
      ]),
    );
    f.time('2026-08-03', 30);
    f.sqlite.prepare("UPDATE project SET billing_model='hybrid' WHERE id=?").run(f.project.id);
    expect(() => f.draft('2026-08-03', '2026-08-03')).toThrow();
    expect(
      f.sqlite.prepare('SELECT COUNT(*) count FROM invoice WHERE project_id=?').get(f.project.id),
    ).toEqual({ count: 0 });
  });
});
