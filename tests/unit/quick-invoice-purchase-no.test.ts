import { describe, expect, it } from 'vitest';
import { invoicePurchaseNo } from '../../apps/portal/src/lib/server/billing-quick-invoice';

describe('quick invoice purchase number (audit T11)', () => {
  it('does not show a project name or number as the PO, so the summary matches the checklist', () => {
    const base = { project_name: 'BBS Mexico', project_number: 'C-0020-P-001' };
    expect(invoicePurchaseNo({ ...base, purchase_no: 'BBS Mexico' })).toBeNull();
    expect(invoicePurchaseNo({ ...base, purchase_no: 'c-0020-p-001' })).toBeNull();
    expect(invoicePurchaseNo({ ...base, purchase_no: '—' })).toBeNull();
    expect(invoicePurchaseNo({ ...base, purchase_no: null })).toBeNull();
    expect(invoicePurchaseNo({ ...base, purchase_no: ' 4500012345 ' })).toBe('4500012345');
  });
});
