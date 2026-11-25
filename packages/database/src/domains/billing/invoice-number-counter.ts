import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import {
  PROJECT_INVOICE_SEQUENCE_SCOPE,
  formatClientProjectNumber,
  invoiceNumberFormatColumn,
  invoiceNumberUsed,
  nextProjectSequence,
  projectInvoiceNumberStem,
  type ProjectNumberContext,
} from './invoice-number-format.ts';

type ErrorConstructor = new (message: string) => Error;
export type InvoiceCounterErrors = {
  access: ErrorConstructor;
  conflict: ErrorConstructor;
  validation: ErrorConstructor;
};

export const MAX_PROJECT_INVOICE_SEQUENCE = 999_999;

/** The client/project numbering context of one project (client code, cost center ...). */
export function projectNumberContext(
  sqlite: DatabaseSync,
  projectId: string,
): ProjectNumberContext | null {
  const row = sqlite
    .prepare(
      `SELECT p.id project_id,p.client_id,p.cost_center_code,p.project_number,
              c.client_code,c.client_number
         FROM project p JOIN client c ON c.id=p.client_id WHERE p.id=?`,
    )
    .get(projectId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    projectId: String(row.project_id),
    clientId: String(row.client_id),
    clientCode: row.client_code,
    clientNumber: row.client_number,
    costCenterCode: row.cost_center_code,
    projectNumber: row.project_number,
  };
}

/** True when an enabled billing stream of the project issues under a client/project policy. */
export function projectUsesClientProjectNumbers(sqlite: DatabaseSync, projectId: string): boolean {
  if (invoiceNumberFormatColumn(sqlite) !== 'number_format') return false;
  const today = new Date().toISOString().slice(0, 10);
  return Boolean(
    sqlite
      .prepare(
        `SELECT 1 FROM billing_rule br
           JOIN invoice_number_policy pol ON pol.legal_entity_id=br.legal_entity_id
          WHERE br.project_id=? AND br.enabled=1 AND pol.accountant_approved_at IS NOT NULL
            AND pol.effective_from<=? AND (pol.effective_to IS NULL OR pol.effective_to>=?)
            AND pol.number_format='client_project_sequence'
          LIMIT 1`,
      )
      .get(projectId, today, today),
  );
}

export type ProjectInvoiceCounter = Readonly<{
  /** The project's invoices are numbered CP-<client>-<NNN>. */
  applies: boolean;
  stem: string;
  /** The stem is already stored (the project issued a CP number before). */
  stemStored: boolean;
  /** NNN of the next invoice issued for this project. */
  nextSequence: number;
  /** The full number the next issued invoice of the project will get. */
  nextNumber: string;
  /** Lowest NNN the owner may choose: never an issued or earlier number. */
  minimumSequence: number;
  /** Numbers of this project's series already used (issued or in a version history). */
  usedNumbers: string[];
}>;

function firstFreeSequence(sqlite: DatabaseSync, stem: string, from: number): number {
  let sequence = from;
  while (invoiceNumberUsed(sqlite, formatClientProjectNumber(stem, sequence))) sequence += 1;
  return sequence;
}

function usedSeriesNumbers(sqlite: DatabaseSync, stem: string): string[] {
  const pattern = `${stem.replace(/[\\%_]/gu, (c) => `\\${c}`)}-%`;
  const hasRevisions = Boolean(
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='invoice_revision'").get(),
  );
  const rows = sqlite
    .prepare(
      `SELECT invoice_number n FROM invoice WHERE invoice_number LIKE ? ESCAPE '\\'
       ${hasRevisions ? "UNION SELECT invoice_number FROM invoice_revision WHERE invoice_number LIKE ? ESCAPE '\\'" : ''}`,
    )
    .all(...(hasRevisions ? [pattern, pattern] : [pattern])) as Array<{ n: string }>;
  const suffix = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}-\\d+$`, 'u');
  return rows
    .map((row) => row.n)
    .filter((number) => suffix.test(number))
    .sort();
}

export function projectInvoiceCounter(
  sqlite: DatabaseSync,
  projectId: string,
): ProjectInvoiceCounter | null {
  const context = projectNumberContext(sqlite, projectId);
  if (!context) return null;
  const { stem, stored } = projectInvoiceNumberStem(sqlite, context);
  const minimumSequence = firstFreeSequence(sqlite, stem, nextProjectSequence(sqlite, projectId));
  return {
    applies: projectUsesClientProjectNumbers(sqlite, projectId),
    stem,
    stemStored: stored,
    nextSequence: minimumSequence,
    nextNumber: formatClientProjectNumber(stem, minimumSequence),
    minimumSequence,
    usedNumbers: usedSeriesNumbers(sqlite, stem),
  };
}

/**
 * Owner decision 2026-11-25: the owner sets the NNN the project's next issued invoice gets
 * (e.g. start at 003 when 001 and 002 were issued outside the portal). Only a number at or
 * after the next free one and not used by any invoice or invoice version is accepted, so an
 * issued number is never reused. The database keeps invoice numbers unique on issue.
 */
export function setProjectInvoiceCounter(
  sqlite: DatabaseSync,
  principal: Principal,
  projectId: string,
  input: Readonly<{ nextSequence: number; reason?: string }>,
  errors: InvoiceCounterErrors,
) {
  assertActiveAccount(sqlite, principal, errors.access);
  assertLiveSession(sqlite, principal, errors.access);
  if (principal.role !== 'owner_admin') throw new errors.access('Owner role required');
  const requested = Number(input.nextSequence);
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > MAX_PROJECT_INVOICE_SEQUENCE)
    throw new errors.validation(
      `Enter a whole number from 1 to ${MAX_PROJECT_INVOICE_SEQUENCE}.`,
    );
  const reason = String(input.reason ?? '').trim().slice(0, 500) || null;
  return runImmediateTransaction(sqlite, 'invoice-number-counter', () => {
    const role = (sqlite.prepare('SELECT role FROM user WHERE id=?').get(principal.userId) as
      | { role: string }
      | undefined)?.role;
    if (role !== 'owner_admin') throw new errors.access('Owner role required');
    const counter = projectInvoiceCounter(sqlite, projectId);
    if (!counter) throw new errors.validation('Project not found');
    if (!counter.applies)
      throw new errors.conflict(
        'This project is not numbered CP-<client>-<NNN>. Set the invoice-number format of the issuer first.',
      );
    const number = formatClientProjectNumber(counter.stem, requested);
    if (requested < counter.minimumSequence)
      throw new errors.conflict(
        `The next free number is ${counter.nextNumber}. Earlier numbers are issued or skipped and cannot be used again.`,
      );
    if (invoiceNumberUsed(sqlite, number))
      throw new errors.conflict(`${number} is already used by another invoice.`);
    const before = counter.nextSequence;
    sqlite
      .prepare(
        `INSERT INTO number_sequence(scope,scope_id,next_value,version) VALUES(?,?,?,1)
         ON CONFLICT(scope,scope_id) DO UPDATE SET next_value=excluded.next_value,version=version+1`,
      )
      .run(PROJECT_INVOICE_SEQUENCE_SCOPE, projectId, requested);
    recordAuditEvent(sqlite, principal, 'invoice.number_counter_set', 'project', projectId, {
      projectId,
      before: { nextSequence: before, nextNumber: counter.nextNumber },
      after: { nextSequence: requested, nextNumber: number },
      ...(reason ? { reason } : {}),
    });
    return { nextSequence: requested, nextNumber: number, previousNumber: counter.nextNumber };
  });
}
