import { describe, expect, it, vi } from 'vitest';
import { ConflictError, ReadinessError, ValidationError } from '@ja/database';

const state = vi.hoisted(() => ({
  closeResult: null as null | { closed: false; reasons: Array<{ code: string }> },
  ruleValidation: null as string | null,
  archiveError: null as null | 'approved' | 'missing',
}));

vi.mock('$lib/server/portal-repository', () => {
  const changed = () => {
    throw new ConflictError('Invoice changed. Reload before recalculating.');
  };
  return {
    openPortalRepository: () => ({
      principal: { role: 'finance_admin' },
      sqlite: { close: vi.fn() },
      repository: {
        setInvoicePlanningDates: changed,
        approveInvoiceDraft: changed,
        recalculateApprovedInvoice: changed,
        deleteInvoice: changed,
        issueInvoice: changed,
        updateBillingRule: () => {
          if (state.ruleValidation) throw new ValidationError(state.ruleValidation);
          changed();
        },
        archiveBillingRule: () => {
          if (state.archiveError === 'approved')
            throw new ConflictError(
              'Issue or recalculate approved invoices before archiving this billing rule',
            );
          throw new ValidationError('Active billing rule not found');
        },
        createInvoiceDraft: () => {
          throw new ReadinessError([{ code: 'pending_time_approval' }]);
        },
      },
      v3: {
        closeBillingPeriod: () => state.closeResult ?? changed(),
        voidInvoice: changed,
      },
    }),
  };
});

import { billingActions } from '../../apps/portal/src/lib/server/actions/billing-actions';

const invoiceId = '00000000-0000-4000-8000-000000000001';
const billingRuleId = '00000000-0000-4000-8000-000000000002';

async function submit(operation: keyof typeof billingActions, values: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  const result = await billingActions[operation]({
    params: { section: 'billing' },
    request: new Request('http://localhost/app/billing', { method: 'POST', body }),
  } as never);
  if (!('status' in result) || !('data' in result)) throw new Error('Expected a failure');
  return result;
}

describe('billing repository failure retention', () => {
  it('passes strict planning validation with scroll metadata and retains stale form state', async () => {
    const result = await submit('setInvoicePlanningDates', {
      invoiceId,
      plannedIssueOn: '2026-09-25',
      expectedCollectionOn: '2026-10-25',
      expectedVersion: '2',
      viewportScrollY: '700',
      drawerScrollTop: '280',
    });
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'BILLING_RECORD_CHANGED',
      billingOperation: 'setInvoicePlanningDates',
      values: {
        invoiceId,
        plannedIssueOn: '2026-09-25',
        expectedCollectionOn: '2026-10-25',
        expectedVersion: '2',
        viewportScrollY: '700',
        drawerScrollTop: '280',
      },
    });
  });

  it.each([
    ['approveInvoice', { invoiceId }],
    ['recalculateApprovedInvoice', { invoiceId, version: '4', reason: 'New source' }],
    ['deleteInvoice', { invoiceId, version: '4', reason: 'Correction' }],
    ['issueInvoice', { invoiceId, reportLocale: 'pt' }],
  ] as const)(
    '%s keeps invoice identity after a repository conflict',
    async (operation, values) => {
      const result = await submit(operation, { ...values, drawerScrollTop: '325' });
      expect(result.data).toMatchObject({
        code: 'BILLING_RECORD_CHANGED',
        billingOperation: operation,
        values: { invoiceId, drawerScrollTop: '325' },
      });
    },
  );

  it('keeps close-period readiness reasons, role remedy, and dates together', async () => {
    state.closeResult = { closed: false, reasons: [{ code: 'pending_time_approval' }] };
    try {
      const result = await submit('closePeriod', {
        billingRuleId,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        reportLocale: 'es',
      });
      expect(result.status).toBe(409);
      expect(result.data).toMatchObject({
        code: 'BILLING_READINESS_PENDING_TIME_APPROVAL',
        billingOperation: 'closePeriod',
        values: {
          billingRuleId,
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
          reportLocale: 'es',
        },
        reasons: [{ code: 'pending_time_approval' }],
        remedies: [{ id: 'review_pending_records' }],
      });
    } finally {
      state.closeResult = null;
    }
  });

  it('adds operation and retained values to draft readiness without losing the selected period', async () => {
    const result = await submit('createDraft', {
      billingRuleId,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'BILLING_READINESS_PENDING_TIME_APPROVAL',
      billingOperation: 'createDraft',
      billingRuleId,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      values: { billingRuleId, periodStart: '2026-09-01', periodEnd: '2026-09-30' },
      reasons: [{ code: 'pending_time_approval' }],
    });
  });

  it('keeps a void reason without echoing the idempotency key', async () => {
    const result = await submit('voidInvoice', {
      invoiceId,
      reason: 'Entered in error',
      idempotencyKey: 'void-request-123456',
    });
    expect(result.data).toMatchObject({
      code: 'BILLING_RECORD_CHANGED',
      billingOperation: 'voidInvoice',
      values: { invoiceId, reason: 'Entered in error' },
    });
    expect(result.data.values).not.toHaveProperty('idempotencyKey');
  });

  it('retains an unchecked stream automation choice after a conflict', async () => {
    const result = await submit('updateBillingRule', {
      billingRuleId,
      autoGenerateDraftPresent: '1',
      templateId: 'labor-summary',
    });
    expect(result.data).toMatchObject({
      code: 'BILLING_RECORD_CHANGED',
      billingOperation: 'updateBillingRule',
      values: { billingRuleId, autoGenerateDraft: 'false', templateId: 'labor-summary' },
    });
  });

  it.each([
    [
      'Expenses can only be included in a labor billing stream',
      'BILLING_EXPENSES_REQUIRE_LABOR_STREAM',
      400,
      { includeExpenses: 'on', includeExpensesPresent: '1' },
      'includeExpenses',
    ],
    [
      'Combined labor and separate expense billing rules cannot overlap',
      'BILLING_EXPENSE_BILLING_MODE_OVERLAP',
      409,
      { includeExpenses: 'on', includeExpensesPresent: '1' },
      'includeExpenses',
    ],
    [
      'Automatic invoice issue and send are disabled',
      'BILLING_AUTOMATIC_ISSUANCE_DISABLED',
      400,
      { autoIssue: 'on', autoSend: 'on' },
      'autoIssue',
    ],
  ] as const)(
    'maps updateBillingRule repository rule %s',
    async (message, code, status, submitted, field) => {
      state.ruleValidation = message;
      try {
        const result = await submit('updateBillingRule', { billingRuleId, ...submitted });
        expect(result.status).toBe(status);
        expect(result.data).toMatchObject({
          code,
          billingOperation: 'updateBillingRule',
          remedies: [{ id: 'review_billing_setup' }],
          values: {
            billingRuleId,
            ...Object.fromEntries(
              Object.entries(submitted).filter(([name]) => !name.endsWith('Present')),
            ),
          },
          fieldErrors: { [field]: [expect.any(String)] },
        });
        expect(result.data.messageKey).toMatch(/^problem\.billing\./);
      } finally {
        state.ruleValidation = null;
      }
    },
  );

  it('explains an approved-invoice archive block without losing the selected stream', async () => {
    state.archiveError = 'approved';
    try {
      const result = await submit('archiveBillingRule', { billingRuleId });
      expect(result.status).toBe(409);
      expect(result.data).toMatchObject({
        code: 'BILLING_STREAM_APPROVED_INVOICE_BLOCKS_ARCHIVE',
        messageKey: 'problem.billing.streamApprovedInvoiceBlocksArchive',
        billingOperation: 'archiveBillingRule',
        values: { billingRuleId },
        remedies: [{ id: 'review_invoice' }],
      });
    } finally {
      state.archiveError = null;
    }
  });

  it.each([
    ['updateBillingRule', 'Billing rule not found'],
    ['archiveBillingRule', 'Active billing rule not found'],
  ] as const)('%s names a concurrently unavailable stream', async (operation, message) => {
    state.ruleValidation = operation === 'updateBillingRule' ? message : null;
    try {
      const result = await submit(operation, { billingRuleId });
      expect(result.status).toBe(404);
      expect(result.data).toMatchObject({
        code: 'BILLING_ACTIVE_STREAM_UNAVAILABLE',
        messageKey: 'problem.billing.activeStreamUnavailable',
        billingOperation: operation,
        values: { billingRuleId },
        remedies: [{ id: 'review_billing_setup' }],
      });
    } finally {
      state.ruleValidation = null;
    }
  });
});
