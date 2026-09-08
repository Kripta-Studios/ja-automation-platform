import { afterEach, describe, expect, it } from 'vitest';
import {
  readCashMovements,
  groupCashMovements,
  type CashMovement,
} from '../../apps/portal/src/lib/server/cash-calendar.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) closeB5LifecycleSecurityFixture(f);
});
function fixture() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const principal = stepUpB5Principal(f.sqlite, f.finance, 'cash');
  const timestamp = '2026-09-01T10:00:00.000Z';
  const entity = f.repository.createLegalEntity(f.owner, {
    code: 'CASH',
    legalName: 'Cash Fixture Entity',
    currency: 'EUR',
    billingAddress: 'Fixture address',
    companyIdentifiers: 'CASH',
  });
  const tax = f.repository.createTaxProfile(f.finance, {
    name: 'Fixture no tax',
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
    components: [{ name: 'No tax', basisPoints: 0 }],
  });
  const rule = f.repository.createBillingRule(f.finance, {
    projectId: f.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    taxProfileId: tax.id,
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
  });
  f.sqlite
    .prepare(
      `INSERT INTO invoice(id,project_id,billing_rule_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,snapshot_json,issued_at,due_at,expected_collection_on,created_at,updated_at) VALUES('cash-invoice',?,?,'CASH-001','labor','issued','EUR',100000,0,100000,'{}',?,'2026-09-15','2026-09-20',?,?)`,
    )
    .run(f.project.id, rule.id, timestamp, timestamp, timestamp);
  f.sqlite
    .prepare(
      `INSERT INTO payment(id,invoice_id,amount_minor,currency,received_at,reference,created_at) VALUES('cash-payment','cash-invoice',60000,'EUR','2026-09-02T10:00:00.000Z','Bank receipt',?)`,
    )
    .run(timestamp);
  f.sqlite
    .prepare(
      `INSERT INTO compensation_rule(id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,version) VALUES('cash-rule',?,?,'EUR',5000,'hourly','2026-01-01',1)`,
    )
    .run(f.worker.userId, f.project.id);
  for (const [id, state, day] of [
    ['scheduled-pay', 'approved', '2026-09-10'],
    ['finalized-pay', 'settled', '2026-09-11'],
  ] as const)
    f.sqlite
      .prepare(
        `INSERT INTO compensation_settlement(id,worker_id,project_id,compensation_rule_id,period_start,period_end,source_basis,source_amount_minor,amount_minor,currency,state,settled_at,expected_payment_on,created_at,updated_at) VALUES(?,?,?,'cash-rule',?,?,'approved_labor',30000,30000,'EUR',?,?,?,?,?)`,
      )
      .run(
        id,
        f.worker.userId,
        f.project.id,
        day,
        day,
        state,
        state === 'settled' ? timestamp : null,
        day,
        timestamp,
        timestamp,
      );
  for (const [id, payer, treatment] of [
    ['cash-expense', 'worker', 'reimbursable_at_cost'],
    ['customer-direct', 'client', 'client_direct'],
  ] as const)
    f.sqlite
      .prepare(
        `INSERT INTO expense(id,project_id,worker_id,spent_on,category,currency,amount_minor,project_currency_amount_minor,client_treatment,approval_state,who_paid,reimbursement_state,billing_treatment,expected_reimbursement_on,created_at,updated_at) VALUES(?,?,?,'2026-09-01','hotel','USD',10000,9000,'reimbursable','approved',?,'pending',?,'2026-09-12',?,?)`,
      )
      .run(id, f.project.id, f.worker.userId, payer, treatment, timestamp, timestamp);
  return { ...f, principal };
}

describe('source-backed cash and obligations calendar', () => {
  it('keeps expected dates separate from receipts, compensation finalization and expense FX cost', () => {
    const f = fixture();
    const rows = readCashMovements(f);
    expect(rows.find((row) => row.id === 'receivable:cash-invoice')).toMatchObject({
      amountMinor: '40000',
      date: '2026-09-20',
      dueDate: '2026-09-15',
      basis: 'expected',
      currency: 'EUR',
    });
    expect(rows.find((row) => row.id === 'receipt:cash-payment')).toMatchObject({
      amountMinor: '60000',
      date: '2026-09-02',
      basis: 'actual',
    });
    expect(rows.find((row) => row.sourceId === 'scheduled-pay')).toMatchObject({
      amountMinor: '-30000',
      basis: 'expected',
    });
    expect(rows.find((row) => row.sourceId === 'finalized-pay')).toMatchObject({
      amountMinor: '-30000',
      basis: 'needs_confirmation',
    });
    expect(rows.find((row) => row.sourceId === 'cash-expense')).toMatchObject({
      amountMinor: '-10000',
      currency: 'USD',
      basis: 'expected',
    });
    expect(rows.some((row) => row.sourceId === 'customer-direct')).toBe(false);
    const compensationBefore = f.sqlite
      .prepare('SELECT * FROM compensation_settlement ORDER BY id')
      .all();
    f.sqlite
      .prepare("UPDATE invoice SET expected_collection_on='2026-10-01' WHERE id='cash-invoice'")
      .run();
    const later = readCashMovements(f);
    expect(later.find((row) => row.id === 'receivable:cash-invoice')?.date).toBe('2026-10-01');
    expect(later.filter((row) => row.basis === 'actual')).toEqual(
      rows.filter((row) => row.basis === 'actual'),
    );
    expect(f.sqlite.prepare('SELECT * FROM compensation_settlement ORDER BY id').all()).toEqual(
      compensationBefore,
    );
  });
  it('replaces an expense obligation with exactly one actual reimbursement only on recorded evidence', () => {
    const f = fixture();
    f.v3.recordReimbursement(f.principal, {
      expenseId: 'cash-expense',
      reference: 'Bank transfer 123',
    });
    const rows = readCashMovements(f).filter((row) => row.sourceId === 'cash-expense');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      currency: 'USD',
      amountMinor: '-10000',
      basis: 'actual',
      reference: 'Bank transfer 123',
    });
  });
  it('denies private cash to workers, forged roles and revoked sessions', () => {
    const f = fixture();
    const worker = stepUpB5Principal(f.sqlite, f.worker, 'cash-denied');
    expect(() => readCashMovements({ ...f, principal: worker })).toThrow(/Finance/);
    expect(() =>
      readCashMovements({ ...f, principal: { ...worker, role: 'finance_admin' } }),
    ).toThrow(/Finance/);
    f.sqlite.prepare('DELETE FROM session WHERE id=?').run(f.principal.sessionId!);
    expect(() => readCashMovements(f)).toThrow(/session/);
  });
});

describe('cash buckets reconcile sources without currency mixing or fake opening cash', () => {
  const source: CashMovement = {
    id: 'a',
    sourceId: 'a',
    projectId: 'p',
    project: 'Project',
    party: 'Customer',
    entityId: 'issuer',
    entity: 'Issuer',
    currency: 'EUR',
    kind: 'customer_receipt',
    basis: 'actual',
    date: '2026-09-01',
    dueDate: null,
    amountMinor: '9007199254740993',
    reference: '',
    href: '/app/ledger',
  };
  it('uses exact integers and separate expected, actual and unconfirmed sums', () => {
    const grouped = groupCashMovements(
      [
        source,
        { ...source, id: 'b', amountMinor: '-3', kind: 'receipt_reversal' },
        { ...source, id: 'c', basis: 'expected', amountMinor: '100' },
        { ...source, id: 'd', basis: 'expected', amountMinor: '-40' },
        { ...source, id: 'e', basis: 'needs_confirmation', amountMinor: '-90' },
        { ...source, id: 'f', currency: 'USD', amountMinor: '7' },
        { ...source, id: 'g', date: null, amountMinor: '8' },
      ],
      'month',
    );
    expect(grouped).toHaveLength(3);
    expect(grouped[0]).toMatchObject({
      expectedInMinor: '100',
      expectedOutMinor: '-40',
      expectedNetMinor: '60',
      actualNetMinor: '9007199254740990',
      unconfirmedMinor: '-90',
    });
    expect(grouped[0]?.ids).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(() => groupCashMovements([source, source], 'week')).toThrow(/Duplicate/);
  });
  it('keeps unknown issuing entities separated by project', () => {
    expect(
      groupCashMovements(
        [
          { ...source, entityId: null },
          { ...source, id: 'b', projectId: 'other', entityId: null },
        ],
        'week',
      ),
    ).toHaveLength(2);
  });
});
