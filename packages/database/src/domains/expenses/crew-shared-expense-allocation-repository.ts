import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { newId, type Principal } from '@ja/domain';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { AccessDeniedError, ConflictError, ValidationError } from '../../repository.ts';
import { CrewLeaderRepository } from '../workforce/crew-leader-repository.ts';

export type SharedReceiptAllocationInput = Readonly<{
  requestId: string;
  expenseId: string;
  allocations: readonly Readonly<{
    timeEntryId: string;
    amountMinor: bigint;
  }>[];
}>;

type Receipt = {
  id: string;
  projectId: string;
  workerId: string;
  spentOn: string;
  timeEntryId: string | null;
  amountMinor: number;
  currency: string;
  whoPaid: string;
  vendor: string | null;
  description: string | null;
  category: string;
};

export type SharedReceiptAllocationView = Readonly<{
  id: string;
  expenseId: string;
  vendor: string | null;
  description: string | null;
  category: string;
  totalMinor: number;
  currency: string;
  whoPaid: string;
  allocations: readonly Readonly<{
    timeEntryId: string;
    workerName: string;
    amountMinor: number;
  }>[];
}>;

/** Allocations describe one receipt; expense remains the sole financial source. */
export class CrewSharedExpenseAllocationRepository {
  private readonly sqlite: DatabaseSync;
  private readonly crew: CrewLeaderRepository;
  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
    this.crew = new CrewLeaderRepository(sqlite);
  }

  eligibleReceipts(principal: Principal, projectId: string, workDate: string): Receipt[] {
    // This checks the live worker role/session and scopes the list to the chief's
    // current project crew. No financial classification or worker pay is returned.
    const members = this.crew.assignedWorkers(principal, projectId, workDate);
    if (members.length === 0) return [];
    const placeholders = members.map(() => '?').join(',');
    return this.sqlite
      .prepare(
        `SELECT e.id,e.project_id projectId,e.worker_id workerId,e.spent_on spentOn,
                e.time_entry_id timeEntryId,e.amount_minor amountMinor,e.currency,
                e.who_paid whoPaid,e.vendor,e.description,e.category
         FROM expense e JOIN crew_expense_recorder rec ON rec.expense_id=e.id
         JOIN document d ON d.id=e.receipt_document_id
         WHERE e.project_id=? AND e.spent_on=? AND rec.recorded_by_user_id=?
           AND e.approval_state='draft' AND e.invoice_id IS NULL
           AND e.billing_lock_id IS NULL AND d.state='committed'
           AND d.owner_id=?
           AND e.who_paid IN ('worker','company_card','company_direct')
           AND e.worker_id IN (${placeholders})
           AND NOT EXISTS(SELECT 1 FROM crew_shared_expense_allocation_group g WHERE g.expense_id=e.id)
         ORDER BY e.created_at DESC LIMIT 100`,
      )
      .all(
        projectId,
        workDate,
        principal.userId,
        principal.userId,
        ...members.map((row) => row.id),
      ) as Receipt[];
  }

  allocatedReceipts(
    principal: Principal,
    projectId: string,
    workDate: string,
  ): SharedReceiptAllocationView[] {
    this.crew.assignedWorkers(principal, projectId, workDate);
    const groups = this.sqlite
      .prepare(
        `SELECT g.id,g.expense_id expenseId,e.vendor,e.description,e.category,g.total_minor totalMinor,
                e.currency,e.who_paid whoPaid
         FROM crew_shared_expense_allocation_group g
         JOIN expense e ON e.id=g.expense_id
         WHERE g.actor_user_id=? AND g.project_id=? AND e.spent_on=? AND g.completed=1
         ORDER BY g.created_at DESC LIMIT 100`,
      )
      .all(principal.userId, projectId, workDate) as Omit<
      SharedReceiptAllocationView,
      'allocations'
    >[];
    const output: SharedReceiptAllocationView[] = [];
    for (const group of groups) {
      const allocations = this.sqlite
        .prepare(
          `SELECT a.time_entry_id timeEntryId,u.name workerName,a.amount_minor amountMinor
           FROM crew_shared_expense_allocation a
           JOIN user u ON u.id=a.worker_id
           WHERE a.group_id=? ORDER BY u.name,a.time_entry_id`,
        )
        .all(group.id) as SharedReceiptAllocationView['allocations'][number][];
      try {
        for (const row of allocations) this.crew.entryDetail(principal, row.timeEntryId);
      } catch (caught) {
        if (caught instanceof AccessDeniedError) continue;
        throw caught;
      }
      output.push({ ...group, allocations });
    }
    return output;
  }

  create(
    principal: Principal,
    input: SharedReceiptAllocationInput,
  ): { id: string; replayed: boolean } {
    if (!/^[A-Za-z0-9_-]{16,200}$/u.test(input.requestId))
      throw new ValidationError('Shared receipt request ID is invalid');
    if (input.allocations.length < 2 || input.allocations.length > 100)
      throw new ValidationError('Choose 2 to 100 crew time rows');
    const normalized = [...input.allocations]
      .map((row) => ({ timeEntryId: row.timeEntryId.trim(), amountMinor: row.amountMinor }))
      .sort((a, b) => a.timeEntryId.localeCompare(b.timeEntryId));
    if (
      normalized.some(
        (row) =>
          !row.timeEntryId ||
          row.amountMinor <= 0n ||
          row.amountMinor > BigInt(Number.MAX_SAFE_INTEGER),
      ) ||
      new Set(normalized.map((row) => row.timeEntryId)).size !== normalized.length
    )
      throw new ValidationError('Each selected crew time row needs a distinct positive amount');
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          expenseId: input.expenseId,
          allocations: normalized.map((row) => [row.timeEntryId, row.amountMinor.toString()]),
        }),
      )
      .digest('hex');
    return runImmediateTransaction(this.sqlite, 'crew-shared-expense', () => {
      const prior = this.sqlite
        .prepare(
          'SELECT id,payload_sha256 hash FROM crew_shared_expense_allocation_group WHERE actor_user_id=? AND request_id=?',
        )
        .get(principal.userId, input.requestId) as { id: string; hash: string } | undefined;
      if (prior) {
        if (prior.hash !== hash) throw new ConflictError('Shared receipt retry has changed');
        const receipt = this.sqlite
          .prepare('SELECT project_id projectId,spent_on spentOn FROM expense WHERE id=?')
          .get(input.expenseId) as { projectId: string; spentOn: string } | undefined;
        if (!receipt) throw new AccessDeniedError('Receipt access required');
        // Revalidate current crew scope even on a replay after grant revocation.
        for (const allocation of normalized) {
          const time = this.crew.entryDetail(principal, allocation.timeEntryId);
          if (time.projectId !== receipt.projectId || time.workDate !== receipt.spentOn)
            throw new AccessDeniedError('Crew time and receipt project/date must match');
        }
        return { id: prior.id, replayed: true };
      }
      const receipt = this.sqlite
        .prepare(
          `SELECT e.id,e.project_id projectId,e.worker_id workerId,e.spent_on spentOn,
                  e.time_entry_id timeEntryId,e.amount_minor amountMinor,e.currency,
                  e.who_paid whoPaid,e.vendor,e.description
           FROM expense e JOIN crew_expense_recorder rec ON rec.expense_id=e.id
           JOIN document d ON d.id=e.receipt_document_id
           WHERE e.id=? AND rec.recorded_by_user_id=? AND e.approval_state='draft'
             AND e.invoice_id IS NULL AND e.billing_lock_id IS NULL
             AND d.state='committed' AND d.owner_id=?
             AND NOT EXISTS(SELECT 1 FROM crew_shared_expense_allocation_group g WHERE g.expense_id=e.id)`,
        )
        .get(input.expenseId, principal.userId, principal.userId) as Receipt | undefined;
      if (!receipt) throw new AccessDeniedError('Unallocated chief-entered receipt required');
      if (!['worker', 'company_card', 'company_direct'].includes(receipt.whoPaid))
        throw new ValidationError('Shared receipt needs one worker or company payer');
      if (!Number.isSafeInteger(receipt.amountMinor) || receipt.amountMinor <= 0)
        throw new ValidationError('Receipt amount is invalid');
      let total = 0n;
      let includesReceiptWorker = false;
      const rows: {
        timeEntryId: string;
        workerId: string;
        grantId: string;
        amountMinor: bigint;
      }[] = [];
      for (const allocation of normalized) {
        const time = this.crew.entryDetail(principal, allocation.timeEntryId);
        if (time.projectId !== receipt.projectId || time.workDate !== receipt.spentOn)
          throw new AccessDeniedError('Crew time and receipt project/date must match');
        const { grantId } = this.crew.authorizeDelegatedOperationalEntry(
          principal,
          time.workerId,
          receipt.projectId,
          receipt.spentOn,
        );
        total += allocation.amountMinor;
        includesReceiptWorker ||= time.workerId === receipt.workerId;
        rows.push({ ...allocation, workerId: time.workerId, grantId });
      }
      if (total !== BigInt(receipt.amountMinor))
        throw new ValidationError('Crew allocations must equal the receipt amount exactly');
      if (new Set(rows.map((row) => row.workerId)).size < 2)
        throw new ValidationError('Allocate the shared receipt to at least two different workers');
      if (!includesReceiptWorker)
        throw new ValidationError('Include the receipt payer/attribution worker in the allocation');
      if (receipt.timeEntryId && !rows.some((row) => row.timeEntryId === receipt.timeEntryId))
        throw new ValidationError('Include the time row already linked to this receipt');
      const id = newId();
      const timestamp = new Date().toISOString();
      this.sqlite
        .prepare(
          `INSERT INTO crew_shared_expense_allocation_group
           (id,expense_id,project_id,actor_user_id,request_id,payload_sha256,total_minor,allocation_count,completed,created_at)
           VALUES(?,?,?,?,?,?,?,?,0,?)`,
        )
        .run(
          id,
          receipt.id,
          receipt.projectId,
          principal.userId,
          input.requestId,
          hash,
          receipt.amountMinor,
          rows.length,
          timestamp,
        );
      const insert = this.sqlite.prepare(
        `INSERT INTO crew_shared_expense_allocation
         (group_id,time_entry_id,worker_id,grant_id,amount_minor,recorded_at)
         VALUES(?,?,?,?,?,?)`,
      );
      for (const row of rows)
        insert.run(
          id,
          row.timeEntryId,
          row.workerId,
          row.grantId,
          Number(row.amountMinor),
          timestamp,
        );
      this.sqlite
        .prepare('UPDATE crew_shared_expense_allocation_group SET completed=1 WHERE id=?')
        .run(id);
      recordAuditEvent(
        this.sqlite,
        principal,
        'expense.allocate_shared_receipt',
        'crew_shared_expense_allocation_group',
        id,
        {
          expenseId: receipt.id,
          projectId: receipt.projectId,
          totalMinor: total.toString(),
          allocations: rows.map((row) => ({
            workerId: row.workerId,
            timeEntryId: row.timeEntryId,
            amountMinor: row.amountMinor.toString(),
          })),
        },
      );
      return { id, replayed: false };
    });
  }
}
