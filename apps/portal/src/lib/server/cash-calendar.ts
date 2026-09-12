import type { DatabaseSync } from 'node:sqlite';
import {
  assertLiveSession,
  AccessDeniedError,
  V3ConflictError,
  type PortalRepository,
  type V3Repository,
} from '@ja/database';
import type { Principal } from '@ja/domain';
import { isStrictIsoCalendarDate, weeklyPeriod } from '@ja/billing-engine';

export type CashMovement = {
  id: string;
  sourceId: string;
  projectId: string;
  project: string;
  party: string;
  entityId: string | null;
  entity: string;
  currency: string;
  kind: 'customer_receipt' | 'receipt_reversal' | 'worker_compensation' | 'worker_reimbursement';
  basis: 'expected' | 'actual' | 'needs_confirmation';
  date: string | null;
  dueDate: string | null;
  amountMinor: string;
  reference: string;
  href: string;
};

type Context = {
  sqlite: DatabaseSync;
  repository: PortalRepository;
  v3: V3Repository;
  principal: Principal;
};
const dateOnly = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  return isStrictIsoCalendarDate(day) ? day : null;
};

/** Read existing payment/obligation sources; no forecasts, balances or payment facts are invented. */
export function readCashMovements(context: Context): CashMovement[] {
  const ownsSnapshot = !context.sqlite.isTransaction;
  if (ownsSnapshot) context.sqlite.exec('BEGIN');
  try {
    const result = readCashMovementSnapshot(context);
    if (ownsSnapshot) context.sqlite.exec('COMMIT');
    return result;
  } catch (cause) {
    if (ownsSnapshot) context.sqlite.exec('ROLLBACK');
    throw cause;
  }
}

function readCashMovementSnapshot(context: Context): CashMovement[] {
  const { sqlite, principal, v3, repository } = context;
  assertLiveSession(sqlite, principal, AccessDeniedError);
  const user = sqlite.prepare('SELECT role,status FROM user WHERE id=?').get(principal.userId) as
    | { role: string; status: string }
    | undefined;
  if (
    !user ||
    user.status !== 'active' ||
    user.role !== principal.role ||
    !['owner_admin', 'finance_admin'].includes(user.role)
  )
    throw new AccessDeniedError('Finance access required');
  // Repository checks live account and persisted finance role before reading finance data.
  repository.listFinanceProjects(principal);
  const movements: CashMovement[] = [];
  const entityCache = new Map<string, { entityId: string | null; entity: string }>();
  const entityOn = (projectId: string, day: string) => {
    const key = `${projectId}:${day}`;
    const cached = entityCache.get(key);
    if (cached) return cached;
    let result: { entityId: string | null; entity: string } = { entityId: null, entity: '' };
    try {
      const resolved = v3.resolveCanonicalProjectLegalEntity(principal, projectId, day);
      const bridge = sqlite
        .prepare(
          'SELECT legacy_legal_entity_id FROM legal_entity_revision_bridge WHERE canonical_revision_id=?',
        )
        .get(resolved.revisionId) as { legacy_legal_entity_id: string } | undefined;
      result = {
        entityId: bridge?.legacy_legal_entity_id ?? `canonical:${resolved.seriesId}`,
        entity: resolved.legalName,
      };
    } catch (cause) {
      if (!(cause instanceof V3ConflictError)) throw cause;
      // Missing/ambiguous issuing assignment is visible as a separate unresolved group.
    }
    entityCache.set(key, result);
    return result;
  };
  for (const invoice of v3.masterLedger(principal)) {
    const metadata = sqlite
      .prepare(
        `SELECT i.project_id,i.expected_collection_on,COALESCE(lr.legal_name,le.legal_name) legal_name,COALESCE(lb.legacy_legal_entity_id,'canonical:'||lr.series_id,br.legal_entity_id) entity_id FROM invoice i LEFT JOIN billing_rule br ON br.id=i.billing_rule_id LEFT JOIN legal_entity le ON le.id=br.legal_entity_id LEFT JOIN legal_entity_revision lr ON lr.revision_id=i.legal_entity_revision_id LEFT JOIN legal_entity_revision_bridge lb ON lb.canonical_revision_id=lr.revision_id WHERE i.id=?`,
      )
      .get(invoice.invoiceId) as {
      project_id: string;
      expected_collection_on: string | null;
      legal_name: string | null;
      entity_id: string | null;
    };
    const common = {
      sourceId: invoice.invoiceId,
      projectId: metadata.project_id,
      project: `${invoice.projectNumber} — ${invoice.projectName}`,
      party: invoice.clientName,
      entityId: metadata.entity_id,
      entity: metadata.legal_name ?? '',
      currency: invoice.currency,
      dueDate: dateOnly(invoice.dueDate),
      reference: invoice.invoiceNumber ?? invoice.invoiceId,
      href: `/app/billing/invoices/${encodeURIComponent(invoice.invoiceId)}`,
    };
    if (BigInt(invoice.outstandingMinor) > 0n)
      movements.push({
        ...common,
        id: `receivable:${invoice.invoiceId}`,
        kind: 'customer_receipt',
        basis: 'expected',
        date: dateOnly(metadata.expected_collection_on) ?? common.dueDate,
        amountMinor: invoice.outstandingMinor,
      });
    for (const payment of invoice.payments) {
      movements.push({
        ...common,
        id: `receipt:${payment.id}`,
        kind: 'customer_receipt',
        basis: 'actual',
        date: dateOnly(payment.received_at),
        amountMinor: String(payment.grossAmountMinor),
        reference: String(payment.reference ?? ''),
      });
    }
    for (const reversal of invoice.paymentReversals)
      movements.push({
        ...common,
        id: `reversal:${reversal.id}`,
        kind: 'receipt_reversal',
        basis: 'actual',
        date: dateOnly(reversal.effectiveAt),
        amountMinor: (-BigInt(reversal.amountMinor)).toString(),
        reference: reversal.reason ?? '',
      });
  }
  const compensationPaymentEvents = v3.listCompensationPaymentEvents(principal);
  for (const settlement of v3.listCompensationSettlements(principal)) {
    const projectId = String(settlement.projectId);
    const day = dateOnly(settlement.periodEnd);
    if (!day) continue;
    const state = String(settlement.paymentState ?? settlement.state);
    const startEntity = entityOn(projectId, String(settlement.periodStart));
    const endEntity = entityOn(projectId, day);
    const entity =
      startEntity.entityId === endEntity.entityId ? endEntity : { entityId: null, entity: '' };
    const href = `/app/finance?project=${encodeURIComponent(projectId)}&view=economic&source=settlements#worker-payments`;
    for (const payment of compensationPaymentEvents.filter(
      (event) => String(event.settlement_id) === String(settlement.id),
    )) {
      const reversal = String(payment.event_type) === 'reversal';
      movements.push({
        id: `compensation-payment:${payment.id}`,
        sourceId: String(settlement.id),
        projectId,
        project: `${settlement.projectNumber} — ${settlement.projectName}`,
        party: String(payment.payee_user_name ?? payment.payee_supplier_name ?? ''),
        ...entity,
        currency: String(payment.currency),
        kind: 'worker_compensation',
        basis: 'actual',
        date: dateOnly(payment.paid_on),
        dueDate: null,
        amountMinor: `${reversal ? '' : '-'}${String(payment.amount_minor)}`,
        reference: String(payment.reference),
        href,
      });
    }
    const remaining = BigInt(String(settlement.remainingAmountMinor ?? settlement.amountMinor));
    if (remaining <= 0n) continue;
    movements.push({
      id: `compensation-balance:${settlement.id}`,
      sourceId: String(settlement.id),
      projectId,
      project: `${settlement.projectNumber} — ${settlement.projectName}`,
      party: String(settlement.workerName ?? ''),
      ...entity,
      currency: String(settlement.currency),
      kind: 'worker_compensation',
      basis: settlement.expectedPaymentOn ? 'expected' : 'needs_confirmation',
      date: dateOnly(settlement.expectedPaymentOn),
      dueDate: null,
      amountMinor: (-remaining).toString(),
      reference: state,
      href,
    });
  }
  // Reuse the repository's correction/source eligibility; monetary cash facts use the
  // original reimbursement currency, as recordReimbursement does, never an FX cost estimate.
  for (const item of v3.listReimbursementQueue(principal)) {
    const expense = sqlite
      .prepare(
        'SELECT currency,CAST(amount_minor AS TEXT) amount_minor,CAST(reimbursement_amount_minor AS TEXT) reimbursement_amount_minor,reimbursed_at,expected_reimbursement_on,reimbursement_reference,billing_treatment FROM expense WHERE id=?',
      )
      .get(String(item.id)) as {
      currency: string;
      amount_minor: string;
      reimbursement_amount_minor: string | null;
      reimbursed_at: string | null;
      expected_reimbursement_on: string | null;
      reimbursement_reference: string | null;
      billing_treatment: string;
    };
    if (
      expense.billing_treatment === 'client_direct' ||
      String(item.reimbursementState) === 'not_required'
    )
      continue;
    const reimbursed = String(item.reimbursementState) === 'reimbursed';
    const actual =
      reimbursed &&
      Boolean(dateOnly(expense.reimbursed_at)) &&
      Boolean(expense.reimbursement_reference);
    const amount = BigInt(
      actual ? (expense.reimbursement_amount_minor ?? expense.amount_minor) : expense.amount_minor,
    );
    if (amount <= 0n) continue;
    const projectId = String(item.projectId);
    movements.push({
      id: `reimbursement:${item.id}`,
      sourceId: String(item.id),
      projectId,
      project: `${item.projectNumber} — ${item.projectName}`,
      party: String(item.workerName ?? ''),
      ...entityOn(projectId, String(item.spentOn)),
      currency: expense.currency,
      kind: 'worker_reimbursement',
      basis: actual ? 'actual' : reimbursed ? 'needs_confirmation' : 'expected',
      date: dateOnly(actual ? expense.reimbursed_at : expense.expected_reimbursement_on),
      dueDate: null,
      amountMinor: (-amount).toString(),
      reference: expense.reimbursement_reference ?? '',
      href: `/app/expenses/${encodeURIComponent(String(item.id))}`,
    });
  }
  return movements.sort(
    (a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.id.localeCompare(b.id),
  );
}

export function groupCashMovements(
  movements: readonly CashMovement[],
  granularity: 'week' | 'month',
) {
  const groups = new Map<
    string,
    {
      entityId: string | null;
      entity: string;
      projectScope: string | null;
      currency: string;
      period: string | null;
      expectedInMinor: bigint;
      expectedOutMinor: bigint;
      actualNetMinor: bigint;
      unconfirmedMinor: bigint;
      ids: string[];
    }
  >();
  const seen = new Set<string>();
  for (const item of movements) {
    if (seen.has(item.id)) throw new Error('Duplicate cash source');
    seen.add(item.id);
    const period = item.date
      ? granularity === 'week'
        ? weeklyPeriod(item.date).start
        : item.date.slice(0, 7)
      : null;
    const key = JSON.stringify([
      item.entityId ?? `unassigned:${item.projectId}`,
      item.currency,
      period,
    ]);
    const group = groups.get(key) ?? {
      entityId: item.entityId,
      entity: item.entity,
      projectScope: item.entityId ? null : item.project,
      currency: item.currency,
      period,
      expectedInMinor: 0n,
      expectedOutMinor: 0n,
      actualNetMinor: 0n,
      unconfirmedMinor: 0n,
      ids: [],
    };
    const amount = BigInt(item.amountMinor);
    if (item.basis === 'actual') group.actualNetMinor += amount;
    else if (item.basis === 'needs_confirmation') group.unconfirmedMinor += amount;
    else if (amount >= 0n) group.expectedInMinor += amount;
    else group.expectedOutMinor += amount;
    group.ids.push(item.id);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    expectedInMinor: group.expectedInMinor.toString(),
    expectedOutMinor: group.expectedOutMinor.toString(),
    expectedNetMinor: (group.expectedInMinor + group.expectedOutMinor).toString(),
    actualNetMinor: group.actualNetMinor.toString(),
    unconfirmedMinor: group.unconfirmedMinor.toString(),
  }));
}
