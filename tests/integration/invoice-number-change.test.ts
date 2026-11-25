import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';
import {
  invoiceNumberingDirectories,
  setupInvoiceNumbering,
} from '../fixtures/invoice-numbering-fixture';

// Owner decision 2026-11-25: the owner changes the invoice number from the invoice page.
// Draft: any unused number. Issued: a new version with the new number; the old number stays in
// the history and is never used again.
const restores: (() => void)[] = [];
beforeEach(() => restores.push(installB5TestDeploymentIdentity()));
afterEach(() => {
  vi.useRealTimers();
  for (const directory of invoiceNumberingDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restores.splice(0).reverse()) restore();
});

type Row = Record<string, unknown>;
const version = (f: ReturnType<typeof setupInvoiceNumbering>, id: string) =>
  Number((f.sqlite.prepare('SELECT version FROM invoice WHERE id=?').get(id) as Row).version);

describe('changing the invoice number', () => {
  it('issues a draft with the number the owner chose and moves the project counter past it', () => {
    const f = setupInvoiceNumbering('client_project_sequence');
    const p = f.project('001');
    const draft = f.repository.createInvoiceDraft(f.finance, p.ruleId, '2026-08-01', '2026-08-31');
    expect(() =>
      f.repository.setDraftInvoiceNumber(f.finance, draft.id, {
        expectedVersion: version(f, draft.id),
        number: 'CP-IMPC-004',
      }),
    ).toThrow(/Owner role required/u);
    f.repository.setDraftInvoiceNumber(f.owner, draft.id, {
      expectedVersion: version(f, draft.id),
      number: 'CP-IMPC-004',
    });
    const preview = f.repository.invoicePreview(f.finance, draft.id).invoice as Row;
    expect(preview.requested_invoice_number).toBe('CP-IMPC-004');
    expect((preview.draft_number_preview as Row).number).toBe('CP-IMPC-004');
    f.repository.approveInvoiceDraft(f.finance, draft.id);
    expect(f.repository.issueInvoice(f.finance, draft.id, 'en').invoiceNumber).toBe('CP-IMPC-004');
    expect(f.issue(p.ruleId, '2026-09-01', '2026-09-30').number).toBe('CP-IMPC-005');
    expect(
      f.sqlite.prepare("SELECT COUNT(*) n FROM audit_event WHERE action='invoice.number_request'").get(),
    ).toEqual({ n: 1 });
  });

  it('refuses a used number for a draft and goes back to automatic when cleared', () => {
    const f = setupInvoiceNumbering('client_project_sequence');
    const p = f.project('001');
    const first = f.issue(p.ruleId, '2026-07-01', '2026-07-31');
    const draft = f.repository.createInvoiceDraft(f.finance, p.ruleId, '2026-08-01', '2026-08-31');
    expect(() =>
      f.repository.setDraftInvoiceNumber(f.owner, draft.id, {
        expectedVersion: version(f, draft.id),
        number: first.number,
      }),
    ).toThrow(/already used/u);
    expect(() =>
      f.repository.setDraftInvoiceNumber(f.owner, draft.id, {
        expectedVersion: version(f, draft.id),
        number: 'bad number!',
      }),
    ).toThrow(/letters, digits/u);
    f.repository.setDraftInvoiceNumber(f.owner, draft.id, {
      expectedVersion: version(f, draft.id),
      number: 'SPECIAL-1',
    });
    f.repository.setDraftInvoiceNumber(f.owner, draft.id, {
      expectedVersion: version(f, draft.id),
      number: '',
    });
    const preview = f.repository.invoicePreview(f.finance, draft.id).invoice as Row;
    expect(preview.requested_invoice_number).toBeNull();
    expect((preview.draft_number_preview as Row).number).toBe('CP-IMPC-002');
  });

  it('renumbers an issued invoice as a new version and never reuses the old number', () => {
    const f = setupInvoiceNumbering('client_project_sequence');
    const p = f.project('001');
    const first = f.issue(p.ruleId, '2026-07-01', '2026-07-31');
    const saved = f.repository.correctIssuedInvoice(f.owner, first.id, {
      expectedRevision: 1,
      field: 'invoiceNumber',
      value: 'CP-IMPC-010',
    });
    expect(saved).toMatchObject({
      revisionNumber: 2,
      invoiceNumber: 'CP-IMPC-010',
      previousInvoiceNumber: 'CP-IMPC-001',
    });
    const view = f.repository.invoicePreview(f.finance, first.id).invoice as Row;
    expect(view.invoice_number).toBe('CP-IMPC-010');
    expect((view.version_history as Row[]).map((entry) => entry.invoiceNumber)).toEqual([
      'CP-IMPC-001',
      'CP-IMPC-010',
    ]);
    // The issued row keeps its number; both numbers stay taken.
    expect(f.sqlite.prepare('SELECT invoice_number FROM invoice WHERE id=?').get(first.id)).toEqual({
      invoice_number: 'CP-IMPC-001',
    });
    expect(f.v3.masterLedger(f.finance, { projectId: p.id })[0]).toMatchObject({
      invoiceNumber: 'CP-IMPC-010',
    });
    expect(
      f.repository.listInvoices(f.finance).find((row) => row.id === first.id),
    ).toMatchObject({ invoice_number: 'CP-IMPC-010' });
    // Going back to the old number is a reuse and is refused.
    expect(() =>
      f.repository.correctIssuedInvoice(f.owner, first.id, {
        expectedRevision: 2,
        field: 'invoiceNumber',
        value: 'CP-IMPC-001',
      }),
    ).toThrow(/never reused/u);
    // Another invoice can never take a number of that history.
    const other = f.issue(p.ruleId, '2026-08-01', '2026-08-31');
    expect(other.number).toBe('CP-IMPC-002');
    expect(() =>
      f.repository.correctIssuedInvoice(f.owner, other.id, {
        expectedRevision: 1,
        field: 'invoiceNumber',
        value: 'CP-IMPC-010',
      }),
    ).toThrow(/already used/u);
    // The database refuses it too.
    expect(() =>
      f.sqlite
        .prepare(
          `INSERT INTO invoice_revision(id,invoice_id,revision_number,invoice_number,previous_invoice_number,
             snapshot_json,calculation_hash,previous_calculation_hash,currency,subtotal_minor,tax_minor,
             total_minor,changed_fields_json,reason,created_by,created_at)
           SELECT 'dup',id,2,'CP-IMPC-010',invoice_number,snapshot_json,calculation_hash,calculation_hash,
                  currency,subtotal_minor,tax_minor,total_minor,'[]',NULL,'owner','2026-11-25T12:00:00.000Z'
             FROM invoice WHERE id=?`,
        )
        .run(other.id),
    ).toThrow(/already used/u);
    // A draft cannot be issued under a number kept in a version history.
    const draft = f.repository.createInvoiceDraft(f.finance, p.ruleId, '2026-09-01', '2026-09-30');
    expect(() =>
      f.repository.setDraftInvoiceNumber(f.owner, draft.id, {
        expectedVersion: version(f, draft.id),
        number: 'CP-IMPC-010',
      }),
    ).toThrow(/already used/u);
    expect(() =>
      f.sqlite.prepare("UPDATE invoice SET invoice_number='CP-IMPC-010' WHERE id=?").run(draft.id),
    ).toThrow(/already used/u);
    // Automatic numbering skips it as well.
    expect(() => f.repository.setProjectInvoiceCounter(f.owner, p.id, { nextSequence: 10 })).toThrow(
      /already used/u,
    );
    expect(f.repository.projectInvoiceCounter(f.owner, p.id)?.usedNumbers).toContain('CP-IMPC-010');
  });
});
