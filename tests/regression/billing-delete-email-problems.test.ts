import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, ValidationError, queueInvoiceEmail } from '@ja/database';
import { openPortalRepository } from '../../apps/portal/src/lib/server/portal-repository';
import {
  billingActionFailure,
  billingActions,
  billingProblemFor,
} from '../../apps/portal/src/lib/server/actions/billing-actions';

vi.mock('../../apps/portal/src/lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../apps/portal/src/lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));
vi.mock('@ja/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ja/database')>()),
  queueInvoiceEmail: vi.fn(),
}));

const invoiceId = '00000000-0000-4000-8000-000000000123';

beforeEach(() => {
  vi.mocked(openPortalRepository).mockReset();
  vi.mocked(queueInvoiceEmail).mockReset();
});

describe('owner invoice deletion problems', () => {
  it.each([
    [
      new ValidationError('A deletion reason is required'),
      400,
      'BILLING_DELETE_REASON_INVALID',
      'problem.billing.deleteReasonInvalid',
      'review_invoice',
    ],
    [
      new ConflictError('Invoice changed. Reload before deleting.'),
      409,
      'BILLING_DELETE_RECORD_CHANGED',
      'problem.billing.deleteRecordChanged',
      'review_invoice',
    ],
    [
      new ConflictError('Issued invoices require a void or adjustment'),
      409,
      'BILLING_DELETE_INVOICE_ISSUED',
      'problem.billing.deleteInvoiceIssued',
      'review_invoice',
    ],
    [
      new ConflictError('This invoice has a versioned PDF. Retain it and create a replacement.'),
      409,
      'BILLING_DELETE_VERSIONED_PDF',
      'problem.billing.deleteVersionedPdf',
      'review_invoice',
    ],
    [
      new ConflictError('This invoice has adjustments or payments'),
      409,
      'BILLING_DELETE_FINANCIAL_ACTIVITY',
      'problem.billing.deleteFinancialActivity',
      'review_ledger',
    ],
    [
      new ConflictError('Invoice sources are finalized'),
      409,
      'BILLING_DELETE_SOURCES_FINALIZED',
      'problem.billing.deleteSourcesFinalized',
      'review_invoice',
    ],
    [
      new ConflictError('Another invoice shares this billing period'),
      409,
      'BILLING_DELETE_PERIOD_SHARED',
      'problem.billing.deletePeriodShared',
      'review_invoice',
    ],
    [
      new ConflictError('Draft invoices with source lines must be superseded, not deleted'),
      409,
      'BILLING_DELETE_SOURCE_LINES_RESERVED',
      'problem.billing.deleteSourceLinesReserved',
      'review_invoice',
    ],
  ])('maps %s to a specific deletion result', (error, status, code, messageKey, remedy) => {
    const values = { invoiceId, version: '4', reason: 'Incorrect billing period' };
    const result = billingActionFailure(error, 'deleteInvoice', 'owner_admin', values);
    expect(result.status).toBe(status);
    expect(result.data).toMatchObject({
      billingOperation: 'deleteInvoice',
      code,
      messageKey,
      remedies: [{ id: remedy }],
      values,
    });
    expect(result.data.message).not.toBe(error.message);
  });

  it('requires an explicit valid owner reason before calling the repository', async () => {
    const deleteInvoice = vi.fn();
    const close = vi.fn();
    vi.mocked(openPortalRepository).mockReturnValue({
      principal: { role: 'owner_admin' },
      repository: { deleteInvoice },
      sqlite: { close },
    } as never);
    const body = new FormData();
    body.set('invoiceId', invoiceId);
    body.set('version', '4');
    body.set('reason', '  ');
    const result = await billingActions.deleteInvoice({
      params: { section: 'billing' },
      request: new Request('http://localhost/app/billing', { method: 'POST', body }),
    } as never);
    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({
      code: 'BILLING_DELETE_REASON_INVALID',
      fieldErrors: { reason: ['Use 3 to 2,000 characters.'] },
      values: { invoiceId, version: '4', reason: '  ' },
    });
    expect(deleteInvoice).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not reuse deletion codes for other invoice actions', () => {
    const problem = billingProblemFor(
      new ConflictError('Issued invoices require a void or adjustment'),
      'voidInvoice',
    );
    expect(problem?.code?.startsWith('BILLING_DELETE_')).not.toBe(true);
  });

  it('keeps the Finance source-line remedy distinct from a changed draft state', () => {
    const result = billingActionFailure(
      new ConflictError('Draft invoices with source lines must be superseded, not deleted'),
      'deleteInvoice',
      'finance_admin',
      { invoiceId },
    );
    expect(result.data).toMatchObject({
      code: 'BILLING_DELETE_SOURCE_LINES_RESERVED',
      remedies: [{ id: 'review_invoice' }],
    });
    expect(String(result.data.message)).toContain('reserves source lines');
  });
});

describe('invoice email PDF problems', () => {
  it('explains an uncertain existing delivery without claiming another email was queued', async () => {
    const close = vi.fn();
    vi.mocked(openPortalRepository).mockReturnValue({
      principal: { role: 'finance_admin' },
      sqlite: { close },
    } as never);
    vi.mocked(queueInvoiceEmail).mockReturnValue({
      id: 'existing-event',
      status: 'uncertain',
      recipient: 'billing@example.com',
    });
    const body = new FormData();
    body.set('invoiceId', invoiceId);
    body.set('recipient', 'billing@example.com');
    body.set('emailChoice', 'yes');
    const result = await billingActions.emailInvoice({
      params: { section: 'billing' },
      locals: { user: { id: 'actor-1' } },
      request: new Request('http://localhost/app/billing', { method: 'POST', body }),
    } as never);
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'BILLING_EMAIL_DELIVERY_UNCERTAIN',
      messageKey: 'problem.billing.emailDeliveryUncertain',
      billingOperation: 'emailInvoice',
      invoiceEmailRecipient: 'billing@example.com',
      remedies: [{ id: 'review_delivery_status' }],
    });
    expect(queueInvoiceEmail).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
  it.each([
    [
      'Issued invoice with ready PDF required',
      'BILLING_EMAIL_PDF_NOT_READY',
      'problem.billing.emailPdfNotReady',
      'review_invoice',
    ],
    [
      'Invoice PDF exceeds email size limit',
      'BILLING_EMAIL_PDF_TOO_LARGE',
      'problem.billing.emailPdfTooLarge',
      'contact_finance',
    ],
    [
      'Invoice PDF integrity verification failed',
      'BILLING_EMAIL_PDF_INTEGRITY_FAILED',
      'problem.billing.emailPdfIntegrityFailed',
      'contact_finance',
    ],
  ])('maps %s without losing the recipient', (message, code, messageKey, remedy) => {
    const values = { invoiceId, recipient: 'billing@example.com', emailChoice: 'yes' };
    const result = billingActionFailure(
      new ValidationError(message),
      'emailInvoice',
      'finance_admin',
      values,
    );
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      billingOperation: 'emailInvoice',
      code,
      messageKey,
      remedies: [{ id: remedy }],
      values,
    });
  });
});
