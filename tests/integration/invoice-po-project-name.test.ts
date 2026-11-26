import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';
import {
  invoiceNumberingDirectories,
  setupInvoiceNumbering,
} from '../fixtures/invoice-numbering-fixture';

// Final verify 2026-11-26 (bug 1): the composer shows "No PO number" when the stream/project PO
// only holds the project name, so the issued invoice must not print "PURCHASE NO. <project>".
const restores: (() => void)[] = [];
beforeEach(() => restores.push(installB5TestDeploymentIdentity()));
afterEach(() => {
  for (const directory of invoiceNumberingDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restores.splice(0).reverse()) restore();
});

type Row = Record<string, unknown>;

function issueWithStreamPo(po: string) {
  const f = setupInvoiceNumbering('client_project_sequence');
  const p = f.project('001');
  f.sqlite.prepare('UPDATE billing_rule SET po_number_override=? WHERE id=?').run(po, p.ruleId);
  const draft = f.repository.createInvoiceDraft(f.finance, p.ruleId, '2026-08-01', '2026-08-31');
  const draftView = f.repository.invoicePreview(f.finance, draft.id).invoice as Row;
  f.repository.approveInvoiceDraft(f.finance, draft.id);
  f.repository.issueInvoice(f.finance, draft.id, 'en');
  const snapshot = () =>
    JSON.parse(
      String(
        (f.sqlite.prepare('SELECT snapshot_json FROM invoice WHERE id=?').get(draft.id) as Row)
          .snapshot_json,
      ),
    ) as Row;
  return { ...f, id: draft.id, draftView, snapshot };
}

describe('purchase number that is only the project name', () => {
  it('is not shown on the draft nor printed on the issued invoice', () => {
    const f = issueWithStreamPo('project 1');
    expect(f.draftView.purchase_no).toBe('—');
    const snapshot = f.snapshot();
    expect(snapshot.purchaseNo).toBeNull();
    expect((snapshot.project as Row).poNumber).toBeNull();
    expect((f.repository.invoicePreview(f.finance, f.id).invoice as Row).purchase_no).toBe('—');
  });

  it('still prints a real purchase order', () => {
    const f = issueWithStreamPo('4500012345');
    expect(f.draftView.purchase_no).toBe('4500012345');
    const snapshot = f.snapshot();
    expect(snapshot.purchaseNo).toBe('4500012345');
    expect((snapshot.project as Row).poNumber).toBe('4500012345');
  });

  it('a new version never prints the project name as the PO; version 1 stays', () => {
    const f = issueWithStreamPo('4500012345');
    const issuedRow = f.sqlite.prepare('SELECT * FROM invoice WHERE id=?').get(f.id);
    f.repository.correctIssuedInvoice(f.owner, f.id, {
      expectedRevision: 1,
      field: 'purchaseNo',
      value: 'project 1',
    });
    expect(f.sqlite.prepare('SELECT * FROM invoice WHERE id=?').get(f.id)).toEqual(issuedRow);
    const revision = f.sqlite
      .prepare('SELECT snapshot_json,changed_fields_json FROM invoice_revision WHERE revision_number=2')
      .get() as Row;
    const v2 = JSON.parse(String(revision.snapshot_json)) as Row;
    expect(v2.purchaseNo).toBeNull();
    expect(JSON.parse(String(revision.changed_fields_json))).toEqual([
      { field: 'purchaseNo', before: '4500012345', after: null },
    ]);
  });
});
