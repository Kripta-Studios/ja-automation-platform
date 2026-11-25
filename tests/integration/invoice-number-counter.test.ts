import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';
import {
  invoiceNumberingDirectories,
  setupInvoiceNumbering,
} from '../fixtures/invoice-numbering-fixture';

// Owner decision 2026-11-25: the owner sets the next invoice number of a project (e.g. start
// at 003); only the next free number or a later unused one is accepted, never an issued one.
const restores: (() => void)[] = [];
beforeEach(() => restores.push(installB5TestDeploymentIdentity()));
afterEach(() => {
  vi.useRealTimers();
  for (const directory of invoiceNumberingDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restores.splice(0).reverse()) restore();
});

describe('project invoice number counter', () => {
  it('lets the owner start the next invoice at 003 and shows it on the draft', () => {
    const f = setupInvoiceNumbering('client_project_sequence');
    const p = f.project('001');
    expect(f.repository.projectInvoiceCounter(f.owner, p.id)).toMatchObject({
      applies: true,
      stem: 'CP-IMPC',
      nextNumber: 'CP-IMPC-001',
      minimumSequence: 1,
      usedNumbers: [],
    });
    const saved = f.repository.setProjectInvoiceCounter(f.owner, p.id, { nextSequence: 3 });
    expect(saved).toEqual({
      nextSequence: 3,
      nextNumber: 'CP-IMPC-003',
      previousNumber: 'CP-IMPC-001',
    });
    const draft = f.repository.createInvoiceDraft(f.finance, p.ruleId, '2026-08-01', '2026-08-31');
    const preview = f.repository.invoicePreview(f.finance, draft.id).invoice as {
      draft_number_preview: { number: string | null };
    };
    expect(preview.draft_number_preview.number).toBe('CP-IMPC-003');
    f.repository.approveInvoiceDraft(f.finance, draft.id);
    expect(f.repository.issueInvoice(f.finance, draft.id, 'en').invoiceNumber).toBe('CP-IMPC-003');
    expect(f.repository.projectInvoiceCounter(f.owner, p.id)).toMatchObject({
      nextNumber: 'CP-IMPC-004',
      minimumSequence: 4,
      usedNumbers: ['CP-IMPC-003'],
    });
    const audit = f.sqlite
      .prepare(
        "SELECT entity_type,entity_id,before_json,after_json FROM audit_event WHERE action='invoice.number_counter_set'",
      )
      .all() as Array<Record<string, string>>;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entity_type: 'project', entity_id: p.id });
    expect(JSON.parse(audit[0]!.after_json)).toEqual({ nextSequence: 3, nextNumber: 'CP-IMPC-003' });
  });

  it('never accepts an issued, skipped or earlier number', () => {
    const f = setupInvoiceNumbering('client_project_sequence');
    const p = f.project('001');
    f.issue(p.ruleId, '2026-07-01', '2026-07-31');
    f.issue(p.ruleId, '2026-08-01', '2026-08-31');
    expect(f.repository.projectInvoiceCounter(f.owner, p.id)?.nextNumber).toBe('CP-IMPC-003');
    expect(() => f.repository.setProjectInvoiceCounter(f.owner, p.id, { nextSequence: 2 })).toThrow(
      /next free number is CP-IMPC-003/u,
    );
    expect(() => f.repository.setProjectInvoiceCounter(f.owner, p.id, { nextSequence: 0 })).toThrow(
      /whole number/u,
    );
    f.repository.setProjectInvoiceCounter(f.owner, p.id, { nextSequence: 7 });
    // Going back to the skipped 3..6 is refused once 7 is the next number.
    expect(() => f.repository.setProjectInvoiceCounter(f.owner, p.id, { nextSequence: 5 })).toThrow(
      /CP-IMPC-007/u,
    );
    expect(f.issue(p.ruleId, '2026-09-01', '2026-09-30').number).toBe('CP-IMPC-007');
  });

  it('is owner only and requires the client/project format', () => {
    const f = setupInvoiceNumbering('client_project_sequence');
    const p = f.project('001');
    expect(() =>
      f.repository.setProjectInvoiceCounter(f.finance, p.id, { nextSequence: 3 }),
    ).toThrow(/Owner role required/u);
    const legacy = setupInvoiceNumbering('prefix_year_sequence');
    const q = legacy.project('001');
    expect(legacy.repository.projectInvoiceCounter(legacy.owner, q.id)?.applies).toBe(false);
    expect(() =>
      legacy.repository.setProjectInvoiceCounter(legacy.owner, q.id, { nextSequence: 3 }),
    ).toThrow(/not numbered CP/u);
  });

  it('keeps invoice numbers unique in the database', () => {
    const f = setupInvoiceNumbering('client_project_sequence');
    const p = f.project('001');
    const first = f.issue(p.ruleId, '2026-07-01', '2026-07-31');
    const draft = f.repository.createInvoiceDraft(f.finance, p.ruleId, '2026-08-01', '2026-08-31');
    expect(() =>
      f.sqlite.prepare('UPDATE invoice SET invoice_number=? WHERE id=?').run(first.number, draft.id),
    ).toThrow(/UNIQUE/u);
  });
});
