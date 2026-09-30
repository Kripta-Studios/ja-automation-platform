import { describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, ConflictError, PortalRepository } from '@ja/database';

function exercise(
  state: string,
  invoiceNumber: string | null,
  issuedAt: string | null,
  role = 'finance_admin',
) {
  const run = vi.fn();
  const prepare = vi.fn((sql: string) => {
    if (sql.startsWith('SELECT'))
      return {
        get: () => ({
          id: 'invoice-1',
          state,
          invoice_number: invoiceNumber,
          issued_at: issuedAt,
          snapshot_json: JSON.stringify({
            purchaseNo: 'original',
            companyInfo: { name: 'Existing company' },
          }),
        }),
      };
    return { run };
  });
  const repository = Object.assign(Object.create(PortalRepository.prototype), {
    sqlite: { prepare },
    assertActive: vi.fn(),
    transaction: (work: () => unknown) => work(),
  }) as PortalRepository;
  const update = () =>
    repository.updateInvoiceDraftCustomizations({ role } as never, 'invoice-1', {
      purchaseNo: 'Revised purchase',
      companyInfo: { phone: 'QA-only' },
      discountMinor: '0',
    });
  return { update, prepare, run };
}

describe('invoice customization preserves historical issue markers', () => {
  for (const state of ['draft', 'approved']) {
    it.each([
      ['INV-1', null],
      [null, '2026-09-30T00:00:00Z'],
      ['', null],
      [null, ''],
    ] as const)(`rejects ${state} with markers %s / %s before any update`, (number, date) => {
      const { update, prepare, run } = exercise(state, number, date);
      expect(update).toThrow(new ConflictError('Invoice has historical issue markers'));
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(run).not.toHaveBeenCalled();
    });

    it(`preserves valid ${state} customization merge and explicit zero discount`, () => {
      const { update, run } = exercise(state, null, null);
      expect(update()).toEqual({ success: true });
      expect(run).toHaveBeenCalledTimes(1);
      expect(JSON.parse(run.mock.calls[0]![0] as string)).toEqual({
        purchaseNo: 'Revised purchase',
        companyInfo: { name: 'Existing company', phone: 'QA-only' },
        discountMinor: '0',
      });
    });
  }
  it('rejects Auditor before consulting or changing the invoice', () => {
    const { update, prepare, run } = exercise('draft', null, null, 'auditor_read_only');
    expect(update).toThrow(AccessDeniedError);
    expect(prepare).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
