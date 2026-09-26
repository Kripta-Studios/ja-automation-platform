import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => ({
    sqlite: { close: vi.fn() },
    principal: { role: 'finance_admin' },
  }),
}));

import { billingActions } from '../../apps/portal/src/lib/server/actions/billing-actions';

describe('billing email choice validation', () => {
  it('keeps the invoice and recipient while explaining the required choice', async () => {
    const body = new FormData();
    body.set('invoiceId', 'invoice-123');
    body.set('recipient', 'billing@example.test');
    const result = await billingActions.emailInvoice({
      params: { section: 'billing' },
      request: new Request('http://localhost/app/billing', { method: 'POST', body }),
    } as never);
    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({
      code: 'BILLING_EMAIL_CHOICE_REQUIRED',
      messageKey: 'problem.billing.emailChoiceRequired',
      fieldErrors: { emailChoice: ['Please select an option.'] },
      remedies: [{ id: 'review_invoice' }],
      values: { invoiceId: 'invoice-123', recipient: 'billing@example.test' },
      invoiceEmailRecipient: 'billing@example.test',
      invoiceEmailId: 'invoice-123',
    });
  });
});
