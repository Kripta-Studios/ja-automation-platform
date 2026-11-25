import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { queueInvoiceEmail } from '@ja/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';
import {
  invoiceNumberingDirectories,
  setupInvoiceNumbering,
} from '../fixtures/invoice-numbering-fixture';
import {
  correctedInvoiceState,
  divideRoundHalfAway,
} from '../../packages/database/src/domains/billing/invoice-revision.ts';

// Owner decision 2026-11-25: correcting an ISSUED invoice keeps its number and creates a new
// version (v2, v3 ...). Version 1 (the issued row), its PDF and hash never change; totals,
// balance and payments follow the current version. No credit note.
const restores: (() => void)[] = [];
beforeEach(() => restores.push(installB5TestDeploymentIdentity()));
afterEach(() => {
  vi.useRealTimers();
  for (const directory of invoiceNumberingDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restores.splice(0).reverse()) restore();
});

type Row = Record<string, unknown>;

function issued() {
  const f = setupInvoiceNumbering('client_project_sequence');
  const p = f.project('001');
  const invoice = f.issue(p.ruleId, '2026-08-01', '2026-08-31');
  const row = () =>
    f.sqlite
      .prepare(
        'SELECT invoice_number,state,snapshot_json,calculation_hash,total_minor,subtotal_minor,pdf_status FROM invoice WHERE id=?',
      )
      .get(invoice.id) as Row;
  const preview = () => f.repository.invoicePreview(f.finance, invoice.id) as { invoice: Row; lines: Row[] };
  const ledger = () =>
    f.v3.masterLedger(f.finance, { projectId: p.id }).find((entry) => entry.invoiceId === invoice.id)!;
  const lineId = String((JSON.parse(String(row().snapshot_json)).lines as Row[])[0]!.id);
  const pay = (amountMinor: bigint, key: string) =>
    f.v3.recordPayment(f.finance, {
      invoiceId: invoice.id,
      amountMinor,
      currency: 'USD',
      receivedAt: new Date().toISOString(),
      idempotencyKey: `payment-${key}`,
    });
  return { ...f, p, invoice, row, preview, ledger, lineId, pay };
}

describe('issued invoice versions', () => {
  it('saves a correction as version 2 with the same number and keeps version 1 untouched', () => {
    const f = issued();
    const before = f.row();
    expect(before.invoice_number).toBe('CP-IMPC-001');
    const saved = f.repository.correctIssuedInvoice(f.owner, f.invoice.id, {
      expectedRevision: 1,
      field: 'client',
      value: 'IMPC GmbH (corrected)',
      reason: 'Legal name',
    });
    expect(saved).toMatchObject({ revisionNumber: 2, invoiceNumber: 'CP-IMPC-001' });
    // The issued row is exactly as it was issued.
    expect(f.row()).toEqual(before);
    const view = f.preview().invoice;
    expect(view).toMatchObject({
      invoice_number: 'CP-IMPC-001',
      client_legal_name: 'IMPC GmbH (corrected)',
      current_revision_number: 2,
    });
    const history = view.version_history as Row[];
    expect(history.map((entry) => [entry.revisionNumber, entry.invoiceNumber, entry.current])).toEqual([
      [1, 'CP-IMPC-001', false],
      [2, 'CP-IMPC-001', true],
    ]);
    expect(history[0]!.replacedAt).toBe(history[1]!.createdAt);
    const revision = f.sqlite
      .prepare('SELECT previous_calculation_hash,calculation_hash,changed_fields_json FROM invoice_revision')
      .get() as Row;
    expect(revision.previous_calculation_hash).toBe(before.calculation_hash);
    expect(JSON.parse(String(revision.changed_fields_json))).toEqual([
      { field: 'client', before: 'IMPC Gmbh', after: 'IMPC GmbH (corrected)' },
    ]);
    const audit = f.sqlite
      .prepare("SELECT entity_id,metadata_json FROM audit_event WHERE action='invoice.revision_create'")
      .all() as Row[];
    expect(audit).toHaveLength(1);
    expect(JSON.parse(String(audit[0]!.metadata_json))).toMatchObject({
      revisionNumber: 2,
      invoiceNumber: 'CP-IMPC-001',
      reason: 'Legal name',
    });
    // Version 3 chains to version 2.
    f.repository.correctIssuedInvoice(f.owner, f.invoice.id, {
      expectedRevision: 2,
      field: 'purchaseNo',
      value: 'PO-77',
    });
    const chain = f.sqlite
      .prepare('SELECT revision_number,previous_calculation_hash,calculation_hash FROM invoice_revision ORDER BY revision_number')
      .all() as Row[];
    expect(chain[1]!.previous_calculation_hash).toBe(chain[0]!.calculation_hash);
    expect(f.preview().invoice.purchase_no).toBe('PO-77');
  });

  it('recomputes totals, balance and payments against the current version', () => {
    const f = issued();
    expect(f.ledger().totalMinor).toBe('10000');
    f.repository.correctIssuedInvoice(f.owner, f.invoice.id, {
      expectedRevision: 1,
      field: 'line',
      lineId: f.lineId,
      amountMinor: 12_500n,
    });
    expect(f.row().total_minor).toBe(10000);
    expect(f.ledger()).toMatchObject({ totalMinor: '12500', outstandingMinor: '12500' });
    expect(f.preview().invoice.total_minor).toBe('12500');
    // A payment above version 1 but within version 2 is accepted.
    f.pay(11_000n, 'a');
    expect(f.ledger()).toMatchObject({ collectedMinor: '11000', outstandingMinor: '1500' });
    expect(() => f.pay(2_000n, 'b')).toThrow(/exceeds invoice balance/u);
    // The corrected total cannot drop below what was already received.
    expect(() =>
      f.repository.correctIssuedInvoice(f.owner, f.invoice.id, {
        expectedRevision: 2,
        field: 'line',
        lineId: f.lineId,
        amountMinor: 10_000n,
      }),
    ).toThrow(/more than the corrected total/u);
    f.pay(1_500n, 'c');
    expect(f.row().state).toBe('paid');
    // Raising the total of a paid invoice reopens it as partially paid.
    const raised = f.repository.correctIssuedInvoice(f.owner, f.invoice.id, {
      expectedRevision: 2,
      field: 'line',
      lineId: f.lineId,
      amountMinor: 13_000n,
    });
    expect(raised.state).toBe('partially_paid');
    expect(f.row().state).toBe('partially_paid');
    expect(f.ledger()).toMatchObject({ totalMinor: '13000', outstandingMinor: '500' });
  });

  it('refuses stale versions, other roles and edits outside the version chain', () => {
    const f = issued();
    expect(() =>
      f.repository.correctIssuedInvoice(f.finance, f.invoice.id, {
        expectedRevision: 1,
        field: 'client',
        value: 'X',
      }),
    ).toThrow(/Owner role required/u);
    f.repository.correctIssuedInvoice(f.owner, f.invoice.id, {
      expectedRevision: 1,
      field: 'projectName',
      value: 'Renamed project',
    });
    expect(() =>
      f.repository.correctIssuedInvoice(f.owner, f.invoice.id, {
        expectedRevision: 1,
        field: 'projectName',
        value: 'Other name',
      }),
    ).toThrow(/now at version 2/u);
    expect(() =>
      f.repository.correctIssuedInvoice(f.owner, f.invoice.id, {
        expectedRevision: 2,
        field: 'projectName',
        value: 'Renamed project',
      }),
    ).toThrow(/Nothing changed/u);
    expect(() => f.sqlite.prepare("UPDATE invoice_revision SET reason='x'").run()).toThrow(/immutable/u);
    expect(() => f.sqlite.prepare('DELETE FROM invoice_revision').run()).toThrow(/immutable/u);
    const current = f.sqlite.prepare('SELECT * FROM invoice_revision').get() as Row;
    expect(() =>
      f.sqlite
        .prepare(
          `INSERT INTO invoice_revision(id,invoice_id,revision_number,invoice_number,previous_invoice_number,
             snapshot_json,calculation_hash,previous_calculation_hash,currency,subtotal_minor,tax_minor,
             total_minor,changed_fields_json,reason,created_by,created_at)
           VALUES('bad',?,2,?,?,?,?,?,?,1,0,1,'[]',NULL,'owner',?)`,
        )
        .run(
          f.invoice.id,
          current.invoice_number as string,
          current.invoice_number as string,
          current.snapshot_json as string,
          current.calculation_hash as string,
          current.previous_calculation_hash as string,
          'USD',
          new Date().toISOString(),
        ),
    ).toThrow();
  });

  it('serves the PDF of the current version and keeps every version downloadable', () => {
    const f = issued();
    f.repository.correctIssuedInvoice(f.owner, f.invoice.id, {
      expectedRevision: 1,
      field: 'dueDate',
      value: '2026-12-31',
    });
    expect(() => f.v3.invoicePdfMetadata(f.finance, f.invoice.id)).toThrow(/not ready/u);
    f.repository.recordInvoiceRevisionPdf(f.owner, f.invoice.id, 2, {
      storageKey: `invoices/${f.invoice.id}/versions/v2-abc.pdf`,
      sha256: 'a'.repeat(64),
      byteLength: 100,
    });
    expect(f.v3.invoicePdfMetadata(f.finance, f.invoice.id)).toMatchObject({
      storageKey: `invoices/${f.invoice.id}/versions/v2-abc.pdf`,
      filename: 'CP-IMPC-001.pdf',
    });
    expect(f.v3.invoicePdfMetadata(f.finance, f.invoice.id, 2).filename).toBe('CP-IMPC-001.pdf');
    // Version 1 keeps its own issued PDF (not rendered in this fixture yet).
    expect(() => f.v3.invoicePdfMetadata(f.finance, f.invoice.id, 1)).toThrow(/not ready/u);
    expect(() =>
      f.repository.recordInvoiceRevisionPdf(f.owner, f.invoice.id, 2, {
        storageKey: `invoices/${f.invoice.id}/versions/v2-other.pdf`,
        sha256: 'b'.repeat(64),
        byteLength: 100,
      }),
    ).toThrow(/already has its PDF/u);
    expect(f.preview().invoice).toMatchObject({ pdf_status: 'ready', due_at: '2026-12-31T00:00:00.000Z' });
    expect(f.ledger()).toMatchObject({
      invoiceNumber: 'CP-IMPC-001',
      dueDate: '2026-12-31T00:00:00.000Z',
    });
  });

  it('sends the corrected version by email with its own PDF', () => {
    const f = issued();
    const previousRoot = process.env.JA_DOCUMENT_ROOT;
    const root = join(f.directory, 'documents');
    process.env.JA_DOCUMENT_ROOT = root;
    try {
      f.repository.correctIssuedInvoice(f.owner, f.invoice.id, {
        expectedRevision: 1,
        field: 'line',
        lineId: f.lineId,
        amountMinor: 11_000n,
      });
      expect(() =>
        queueInvoiceEmail(f.sqlite, f.owner, {
          invoiceId: f.invoice.id,
          recipient: 'billing@impc.example',
          emailConfirmed: true,
        }),
      ).toThrow(/corrected version is not ready/u);
      const bytes = Buffer.from('%PDF-1.4\ncorrected\n%%EOF\n');
      const key = `invoices/${f.invoice.id}/versions/v2-test.pdf`;
      mkdirSync(join(root, 'invoices', f.invoice.id, 'versions'), { recursive: true });
      writeFileSync(join(root, key), bytes);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      f.repository.recordInvoiceRevisionPdf(f.owner, f.invoice.id, 2, {
        storageKey: key,
        sha256,
        byteLength: bytes.byteLength,
      });
      const queued = queueInvoiceEmail(f.sqlite, f.owner, {
        invoiceId: f.invoice.id,
        recipient: 'billing@impc.example',
        emailConfirmed: true,
      });
      expect(queued.status).toBe('queued');
      const payload = JSON.parse(
        String(
          (f.sqlite.prepare('SELECT payload_json FROM outbox_event WHERE id=?').get(queued.id) as Row)
            .payload_json,
        ),
      );
      expect(payload).toMatchObject({ revisionNumber: 2, pdfSha256: sha256 });
    } finally {
      if (previousRoot === undefined) delete process.env.JA_DOCUMENT_ROOT;
      else process.env.JA_DOCUMENT_ROOT = previousRoot;
    }
  });

  it('rounds exactly and derives the lifecycle state', () => {
    expect(divideRoundHalfAway(15n, 10n)).toBe(2n);
    expect(divideRoundHalfAway(-15n, 10n)).toBe(-2n);
    expect(divideRoundHalfAway(14n, 10n)).toBe(1n);
    expect(correctedInvoiceState(100n, 100n, null, false)).toBe('paid');
    expect(correctedInvoiceState(100n, 50n, '2026-01-01', true, '2026-11-25')).toBe('overdue');
    expect(correctedInvoiceState(100n, 50n, '2026-12-01', true, '2026-11-25')).toBe('partially_paid');
    expect(correctedInvoiceState(100n, 0n, '2026-12-01', true, '2026-11-25')).toBe('sent');
    expect(correctedInvoiceState(100n, 0n, null, false)).toBe('issued');
  });
});
