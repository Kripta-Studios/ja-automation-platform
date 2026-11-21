import { describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, ConflictError, PortalRepository } from '@ja/database';
import type { Role } from '@ja/domain';

function exercise(
  state: string,
  invoiceNumber: string | null,
  issuedAt: string | null,
  role: Role = 'finance_admin',
) {
  const run = vi.fn((_snapshot: string) => ({ changes: 1 }));
  const audit = vi.fn();
  const readInvoice = vi.fn(() => ({
    id: 'invoice-1',
    version: 3,
    state,
    invoice_number: invoiceNumber,
    issued_at: issuedAt,
    currency: 'USD',
    issuer_legal_entity_id: 'issuer-1',
    payment_terms_days: 30,
    created_at: '2026-09-29T00:00:00Z',
    snapshot_json: JSON.stringify({
      purchaseNo: 'original',
      companyInfo: { name: 'Existing company', phone: 'QA-only' },
      discountMinor: '0',
    }),
  }));
  const prepare = vi.fn((sql: string) => {
    if (sql.startsWith('SELECT status FROM user')) return { get: () => ({ status: 'active' }) };
    if (sql.startsWith('SELECT expires_at FROM session')) {
      return { get: () => ({ expires_at: '2099-01-01T00:00:00Z' }) };
    }
    if (sql.startsWith('SELECT role FROM user')) return { get: () => ({ role }) };
    if (sql.includes('FROM invoice i')) return { get: readInvoice };
    if (sql.includes('FROM legal_entity WHERE')) {
      return { get: () => ({ id: 'issuer-1', code: 'test', currency: 'USD', status: 'active' }) };
    }
    if (sql.startsWith('UPDATE invoice SET snapshot_json')) return { run };
    if (sql.startsWith('INSERT INTO audit_event')) return { run: audit };
    return { get: () => undefined };
  });
  const repository = Object.assign(Object.create(PortalRepository.prototype), {
    sqlite: { prepare, exec: vi.fn() },
    assertInvoiceBillingRuleFresh: vi.fn(),
  }) as PortalRepository;
  const update = () =>
    repository.updateInvoiceDraftCustomizations(
      { userId: 'user-1', sessionId: 'session-1', projectIds: new Set(), role },
      'invoice-1',
      {
        expectedVersion: 3,
        purchaseNo: 'Revised purchase',
        companyInfo: { phone: 'QA-only' },
        discountMinor: '0',
      },
    );
  return { update, prepare, readInvoice, run, audit };
}

describe('invoice customization preserves historical issue markers', () => {
  const markers = [
    ['INV-1', null],
    [null, '2026-09-30T00:00:00Z'],
    ['', null],
    [null, ''],
  ] as const;

  it.each(markers)('rejects draft with markers %s / %s before any update', (number, date) => {
    const { update, readInvoice, run, audit } = exercise('draft', number, date);
    expect(update).toThrow(new ConflictError('Invoice has historical issue markers'));
    expect(readInvoice).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it.each([...markers, [null, null] as const])(
    'requires a replacement to edit an approved invoice with markers %s / %s',
    (number, date) => {
      const { update, readInvoice, run, audit } = exercise('approved', number, date);
      expect(update).toThrow(/Approved invoices require a replacement draft/);
      expect(readInvoice).toHaveBeenCalledOnce();
      expect(run).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    },
  );

  it('merges a draft-only edit and preserves explicit zero discount', () => {
    const { update, run, audit } = exercise('draft', null, null);
    expect(update()).toMatchObject({ success: true, version: 4, sourceSettingsChanged: false });
    expect(run).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledOnce();
    expect(JSON.parse(run.mock.calls[0]![0])).toMatchObject({
      purchaseNo: 'Revised purchase',
      companyInfo: { name: 'Existing company', phone: 'QA-only' },
      discountMinor: '0',
      draftOnlyOverrides: ['purchaseNo'],
    });
  });

  it('rejects Auditor before consulting or changing the invoice', () => {
    const { update, prepare, readInvoice, run, audit } = exercise(
      'draft',
      null,
      null,
      'auditor_read_only',
    );
    expect(update).toThrow(AccessDeniedError);
    expect(prepare.mock.calls.map(([sql]) => sql)).toEqual([
      expect.stringContaining('SELECT status FROM user'),
      expect.stringContaining('SELECT expires_at FROM session'),
    ]);
    expect(readInvoice).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});
