import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  SupplierExpenseRuleRepository,
  isSupplierBillingDetailsRequired,
} from '@ja/database';
import {
  approveSettlement,
  createSupplierRecoveryInvoice,
  markSettlementPaid,
  settlementDetail,
} from '../../apps/portal/src/lib/server/subcontractor-settlement.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  signInB5Principal,
  stepUpB5Principal,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

/**
 * D4 follow-up (2026-11-26): what J&A paid for a supplier's technician and could not deduct
 * from the supplier's settlement is invoiced to the supplier. One line per expense, CP
 * numbering, an expense is never both invoiced and deducted, nor invoiced twice; a void
 * invoice (or a discarded draft) releases it again.
 */
const fixtures: Array<ReturnType<typeof createB5LifecycleSecurityFixture>> = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) closeB5LifecycleSecurityFixture(f);
});

const stamp = '2026-11-01T00:00:00.000Z';
const week = { start: '2026-11-16', end: '2026-11-22' };
const payee = 'supplier:sup-d4' as const;
const billing = {
  legalName: 'D4 Supplier GmbH',
  billingAddress: 'Industriestrasse 4, 70565 Stuttgart, Germany',
  billingEmail: 'billing@d4-supplier.example',
  taxId: 'DE123456789',
  clientCode: 'D4S',
};

function setup() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const finance = stepUpB5Principal(f.sqlite, f.finance, 'recovery');
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'recovery');
  f.sqlite
    .prepare(
      "INSERT INTO supplier(id,name,status,created_at,updated_at) VALUES('sup-d4','D4 Supplier','active',?,?)",
    )
    .run(stamp, stamp);
  f.sqlite
    .prepare(
      "INSERT INTO supplier_user_profile(user_id,supplier_id,profile,created_at,updated_at) VALUES(?,'sup-d4','external_technician',?,?)",
    )
    .run(f.worker.userId, stamp, stamp);
  // The project's issuing company (EUR), CP numbering and a billing stream.
  const entity = f.repository.createLegalEntity(owner, {
    code: 'JAEU',
    legalName: 'J&A Automation Europe',
    currency: 'EUR',
    billingAddress: 'Calle de la Industria 42, Madrid',
    companyIdentifiers: 'ESB12345678',
  });
  const revision = f.v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: entity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'J&A Automation Europe S.L.',
    taxIdentifier: 'ESB12345678',
    addressLine1: 'Calle de la Industria 42',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR',
    timezone: 'Europe/Madrid',
    reason: 'Recovery invoice fixture',
    idempotencyKey: 'recovery:revision',
  });
  f.v3.assignCanonicalLegalEntityToProject(finance, {
    projectId: f.project.id,
    legalEntityRevisionId: revision.revisionId,
    effectiveFrom: '2026-01-01',
    reason: 'Recovery invoice fixture project',
    idempotencyKey: 'recovery:assignment',
  });
  f.repository.createInvoiceNumberPolicy(owner, {
    legalEntityId: entity.id,
    prefix: '123',
    digits: 6,
    effectiveFrom: '2026-01-01',
    accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    numberFormat: 'client_project_sequence',
  });
  f.repository.createBillingRule(finance, {
    projectId: f.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'monthly',
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
  });
  new SupplierExpenseRuleRepository(f.sqlite).setProjectRule(finance, {
    projectId: f.project.id,
    carrier: 'supplier',
    effectiveFrom: '2026-11-01',
  });
  f.sqlite
    .prepare(
      `INSERT INTO compensation_rule(id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,created_at,updated_at)
       VALUES('d4-pay',?,?,'EUR',5000,'hourly','2026-01-01',?,?)`,
    )
    .run(f.worker.userId, f.project.id, stamp, stamp);
  for (const day of ['2026-11-16', '2026-11-17'])
    f.sqlite
      .prepare(
        `INSERT INTO time_entry(id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,created_at,updated_at)
         VALUES(?,?,?,?,'regular',480,'approved','billable',?,?)`,
      )
      .run(`d4-time-${day}`, f.project.id, f.worker.userId, day, stamp, stamp);
  let sequence = 0;
  const expense = (spentOn: string, amountMinor: number, whoPaid = 'company_direct') => {
    sequence += 1;
    const id = `recovery-expense-${sequence}`;
    f.sqlite
      .prepare(
        `INSERT INTO expense(id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,
           approval_state,created_at,updated_at,vendor,description,who_paid,finance_approved_at,reimbursement_state)
         VALUES(?,?,?,?,'hotel','EUR',?,'non_billable','approved',?,?,'Hotel Ibis','Stay',?,?,'pending')`,
      )
      .run(id, f.project.id, f.worker.userId, spentOn, amountMinor, stamp, stamp, whoPaid, stamp);
    return id;
  };
  const context = { sqlite: f.sqlite, v3: f.v3, principal: finance };
  return { f, finance, owner, expense, context };
}

describe('invoice to the supplier for what is still to recover', () => {
  it('asks for billing details, then drafts one line per expense and stops showing it as to recover', () => {
    const { f, context, expense } = setup();
    // Settlement 2 × 8 h × 50.00 = 800.00; the hotel (900.00) does not fit and stays to recover.
    const hotel = expense('2026-11-17', 90000);
    approveSettlement(context, { payee, ...week });
    const before = settlementDetail(context, { payee, ...week })!;
    expect(before.expenses?.toRecover).toEqual([{ currency: 'EUR', minor: '90000' }]);
    expect(before.expenses?.invoiceable).toEqual([hotel]);
    expect(before.supplierBilling).toEqual({
      account: null,
      defaults: { legalName: 'D4 Supplier', billingAddress: '', billingEmail: '' },
    });

    let failure: unknown;
    try {
      createSupplierRecoveryInvoice(context, { payee, ...week });
    } catch (error) {
      failure = error;
    }
    expect(isSupplierBillingDetailsRequired(failure)).toBe(true);
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM supplier_billing_account').get()).toEqual({
      n: 0,
    });

    const result = createSupplierRecoveryInvoice(context, { payee, ...week, billing });
    expect(result.billingAccountCreated).toBe(true);
    expect(result.invoices).toEqual([
      expect.objectContaining({ currency: 'EUR', totalMinor: '90000', expenseCount: 1 }),
    ]);
    const invoiceId = result.invoices[0]!.id;
    expect(
      f.sqlite
        .prepare(
          `SELECT i.state,i.stream_type,CAST(i.total_minor AS TEXT) total,c.legal_name,c.client_code,c.tax_id
             FROM invoice i JOIN project p ON p.id=i.project_id JOIN client c ON c.id=p.client_id WHERE i.id=?`,
        )
        .get(invoiceId),
    ).toEqual({
      state: 'draft',
      stream_type: 'supplier_recharge',
      total: '90000',
      legal_name: 'D4 Supplier GmbH',
      client_code: 'D4S',
      tax_id: 'DE123456789',
    });
    const lines = f.sqlite
      .prepare(
        'SELECT description,source_type,source_id,CAST(subtotal_minor AS TEXT) amount FROM invoice_line WHERE invoice_id=?',
      )
      .all(invoiceId);
    expect(lines).toEqual([
      {
        description: expect.stringMatching(
          /^2026-11-17 · b5-worker · Hotel \(Hotel Ibis\) — Expense paid by J&A/u,
        ),
        source_type: 'supplier_recharge',
        source_id: hotel,
        amount: '90000',
      },
    ]);

    const after = settlementDetail(context, { payee, ...week })!;
    expect(after.expenses?.toRecover).toEqual([]);
    expect(after.expenses?.invoiceable).toEqual([]);
    expect(after.expenses?.invoiced).toEqual([{ currency: 'EUR', minor: '90000' }]);
    expect(after.expenses?.invoices).toEqual([
      expect.objectContaining({ id: invoiceId, state: 'draft', count: 1, minor: '90000' }),
    ]);
    // Never twice: nothing left to invoice, and the database refuses a second live link.
    expect(() => createSupplierRecoveryInvoice(context, { payee, ...week })).toThrow(
      /Nothing is still to recover/u,
    );
    expect(() =>
      f.sqlite
        .prepare(
          `INSERT INTO supplier_expense_recovery(id,expense_id,supplier_id,invoice_id,amount_minor,currency,created_by,created_at)
           SELECT 'dup',expense_id,supplier_id,invoice_id,amount_minor,currency,created_by,created_at FROM supplier_expense_recovery`,
        )
        .run(),
    ).toThrow(/already recovered|UNIQUE/u);

    // Paying the settlement deducts nothing: the hotel is on the supplier invoice.
    markSettlementPaid(context, {
      payee,
      ...week,
      paidOn: '2026-11-24',
      reference: 'CW47',
      requestKey: 'recovery-pay-1',
    });
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM supplier_expense_recharge').get()).toEqual({
      n: 0,
    });
  });

  it('issues with CP numbering, a void releases the expense, and a deducted expense is never invoiced', () => {
    const { f, context, expense, finance } = setup();
    const hotel = expense('2026-11-17', 90000);
    approveSettlement(context, { payee, ...week });
    const { invoices } = createSupplierRecoveryInvoice(context, { payee, ...week, billing });
    const invoiceId = invoices[0]!.id;
    f.repository.approveInvoiceDraft(finance, invoiceId);
    const issued = f.repository.issueInvoice(finance, invoiceId, 'en');
    expect(issued.invoiceNumber).toBe('CP-D4S-001');
    expect(settlementDetail(context, { payee, ...week })!.expenses?.invoices).toEqual([
      expect.objectContaining({ id: invoiceId, number: 'CP-D4S-001', state: 'issued' }),
    ]);
    // A deduction for an invoiced expense is refused by the database too.
    expect(() =>
      f.sqlite
        .prepare(
          `INSERT INTO supplier_expense_recharge(id,expense_id,supplier_id,settlement_id,payment_event_id,amount_minor,currency,created_by,created_at)
           VALUES('x',?,'sup-d4','s','p',90000,'EUR','b5-finance',?)`,
        )
        .run(hotel, stamp),
    ).toThrow(/already invoiced to the supplier|FOREIGN KEY/u);
    // The accounting pack accepts the supplier invoice line (dated by the expense).
    expect(() => f.v3.createAccountingPack(finance, '2026-11-01', '2026-11-30')).not.toThrow();

    f.repository.voidInvoice(finance, invoiceId, 'Wrong supplier address', 'recovery-void-0001');
    const released = settlementDetail(context, { payee, ...week })!;
    expect(released.expenses?.invoiceable).toEqual([hotel]);
    expect(released.expenses?.toRecover).toEqual([{ currency: 'EUR', minor: '90000' }]);
    // The billing details are kept: the next invoice needs no form.
    expect(released.supplierBilling?.account).toEqual(
      expect.objectContaining({ legalName: 'D4 Supplier GmbH', code: 'D4S' }),
    );
    const again = createSupplierRecoveryInvoice(context, { payee, ...week });
    expect(again.billingAccountCreated).toBe(false);
    f.repository.approveInvoiceDraft(finance, again.invoices[0]!.id);
    expect(f.repository.issueInvoice(finance, again.invoices[0]!.id, 'en').invoiceNumber).toBe(
      'CP-D4S-002',
    );
  });

  it('a discarded draft releases its expenses; only Owner and Finance may invoice a supplier', () => {
    const { f, context, expense, owner } = setup();
    const hotel = expense('2026-11-17', 90000);
    approveSettlement(context, { payee, ...week });
    const { invoices } = createSupplierRecoveryInvoice(context, { payee, ...week, billing });
    f.repository.deleteInvoice(owner, invoices[0]!.id, 'Created by mistake');
    expect(settlementDetail(context, { payee, ...week })!.expenses?.invoiceable).toEqual([hotel]);
    const pm = signInB5Principal(f.sqlite, f.manager, 'recovery-pm');
    expect(() =>
      f.repository.createSupplierRecoveryInvoices(pm, {
        supplierId: 'sup-d4',
        expenseIds: [hotel],
      }),
    ).toThrow(AccessDeniedError);
    const worker = signInB5Principal(f.sqlite, f.worker, 'recovery-worker');
    expect(() =>
      f.repository.createSupplierRecoveryInvoices(worker, {
        supplierId: 'sup-d4',
        expenseIds: [hotel],
      }),
    ).toThrow(AccessDeniedError);
    // A forged id (an expense J&A carries) is refused, nothing is created.
    const jaCost = expense('2026-10-20', 5000);
    expect(() =>
      f.repository.createSupplierRecoveryInvoices(context.principal, {
        supplierId: 'sup-d4',
        expenseIds: [hotel, jaCost],
      }),
    ).toThrow(/changed/u);
    expect(
      f.sqlite
        .prepare("SELECT COUNT(*) n FROM invoice WHERE stream_type='supplier_recharge'")
        .get(),
    ).toEqual({ n: 0 });
  });
});
